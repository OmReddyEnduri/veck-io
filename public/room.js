// VECK.IO authoritative match logic. Runs inside the Node server, and inside the browser for offline practice.
// A "client" is any object with sendRaw(string). The host calls room.tick() ~30 times a second.
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./shared.js') : root.VECK);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VECK = Object.assign(root.VECK || {}, api);
})(typeof self !== 'undefined' ? self : this, function (V) {
  'use strict';
  const { PLAYER, WEAPONS, MAP_ORDER, getMap, moveBody, checkPads, rayMap, weaponDamage, sanitizeName, isClear } = V;

  const TICK_MS = 33;
  const MATCH_MS = 6 * 60 * 1000;
  const KILL_GOAL = 30;
  const INTERMISSION_MS = 9000;
  const PICKUP_RESPAWN = 15000;
  const HISTORY_MS = 900;
  const BOT_NAMES = ['Nova', 'Viper', 'Ghost', 'Raze', 'Kairo', 'Blitz', 'Echo', 'Hex', 'Onyx', 'Zed', 'Pulse', 'Vex', 'Rook', 'Jinx'];
  const SKIN_KEYS = Object.keys(V.SKINS);

  const r2 = (n) => Math.round(n * 100) / 100;
  const now = () => Date.now();

  class Room {
    constructor(code, opts = {}) {
      this.code = code;
      this.botFill = opts.botFill ?? 4;
      this.maxPlayers = opts.maxPlayers ?? 12;
      this.players = new Map();       // id -> player
      this.nextId = 1;
      this.mapIdx = opts.map && MAP_ORDER.includes(opts.map) ? MAP_ORDER.indexOf(opts.map) : Math.floor(Math.random() * MAP_ORDER.length);
      this.lockMap = !!(opts.map && MAP_ORDER.includes(opts.map) && opts.lockMap);
      this.state = 'play';
      this.startMatch(true);
    }

    get humanCount() { let n = 0; for (const p of this.players.values()) if (!p.bot) n++; return n; }
    isFull() { return this.humanCount >= this.maxPlayers; }
    isEmpty() { return this.humanCount === 0; }

    // ───── Messaging ─────
    broadcast(msg, except) {
      const s = JSON.stringify(msg);
      for (const p of this.players.values()) if (p.client && p !== except) p.client.sendRaw(s);
    }
    send(p, msg) { if (p.client) p.client.sendRaw(JSON.stringify(msg)); }

    publicInfo(p) { return { id: p.id, name: p.name, skin: p.skin, bot: p.bot, kills: p.kills, deaths: p.deaths, alive: p.alive }; }

    // ───── Match flow ─────
    startMatch(first) {
      this.mapKey = MAP_ORDER[this.mapIdx % MAP_ORDER.length];
      this.map = getMap(this.mapKey);
      this.matchEndsAt = now() + MATCH_MS;
      this.state = 'play';
      this.pickups = this.map.pickups.map((pk) => ({ ...pk, on: true, respawnAt: 0 }));
      if (first) return;
      for (const p of this.players.values()) {
        p.kills = 0; p.deaths = 0; p.dmg = 0; p.streak = 0;
        this.spawn(p, true);
      }
      this.broadcast({ t: 'start', map: this.mapKey, ends: this.matchEndsAt - now(), goal: KILL_GOAL, players: [...this.players.values()].map((p) => this.publicInfo(p)) });
      for (const p of this.players.values()) this.broadcastSpawn(p);
    }

    endMatch() {
      this.state = 'end';
      this.nextStartAt = now() + INTERMISSION_MS;
      if (!this.lockMap) this.mapIdx++;
      const board = [...this.players.values()]
        .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
        .map((p) => ({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths, bot: p.bot }));
      this.broadcast({ t: 'end', board, next: MAP_ORDER[this.mapIdx % MAP_ORDER.length], in: INTERMISSION_MS });
    }

    // ───── Players ─────
    createPlayer(name, skin, bot, client) {
      const p = {
        id: this.nextId++, name, skin: V.SKINS[skin] ? skin : 'CYBER', bot, client,
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, w: 0,
        hp: PLAYER.maxHp, alive: false, deadUntil: 0, protUntil: 0, sp: 0,
        kills: 0, deaths: 0, dmg: 0, streak: 0, lastDamaged: 0,
        hist: [], lastFire: 0, shots: new Map(), ping: 0,
      };
      if (bot) {
        p.vel = { x: 0, y: 0, z: 0 };
        p.phys = { onGround: true, wasGround: true };
        p.ai = { target: null, seenAt: 0, nextThink: 0, nextFire: 0, strafe: 1, strafeUntil: 0, goal: null, goalUntil: 0, lastX: 0, lastZ: 0, stuckAt: 0, reactAt: 0, skill: 0.6 + Math.random() * 0.3, burstUntil: 0, restUntil: 0 };
      }
      this.players.set(p.id, p);
      return p;
    }

    join(client, msg) {
      const p = this.createPlayer(sanitizeName(msg.name), msg.skin, false, client);
      client.player = p;
      this.spawn(p, true);
      this.balanceBots();
      this.send(p, {
        t: 'welcome', id: p.id, room: this.code, map: this.mapKey, T: now(), tick: TICK_MS,
        ends: this.state === 'play' ? this.matchEndsAt - now() : 0, goal: KILL_GOAL, state: this.state,
        players: [...this.players.values()].map((q) => this.publicInfo(q)),
        pickups: this.pickups.map((pk) => (pk.on ? 1 : 0)),
      });
      this.broadcast({ t: 'join', p: this.publicInfo(p) }, p);
      this.broadcastSpawn(p);
      return p;
    }

    leave(client) {
      const p = client.player;
      if (!p || !this.players.has(p.id)) return;
      this.players.delete(p.id);
      this.broadcast({ t: 'leave', id: p.id });
      this.balanceBots();
    }

    balanceBots() {
      const humans = this.humanCount;
      if (humans === 0) return;
      const want = Math.max(0, this.botFill - humans);
      const bots = [...this.players.values()].filter((p) => p.bot);
      while (bots.length > want) {
        const b = bots.pop();
        this.players.delete(b.id);
        this.broadcast({ t: 'leave', id: b.id });
      }
      const used = new Set([...this.players.values()].map((p) => p.name));
      while (bots.length < want) {
        const name = BOT_NAMES.find((n) => !used.has(n)) || 'Bot' + this.nextId;
        used.add(name);
        const b = this.createPlayer(name, SKIN_KEYS[Math.floor(Math.random() * SKIN_KEYS.length)], true, null);
        this.spawn(b, true);
        bots.push(b);
        this.broadcast({ t: 'join', p: this.publicInfo(b) });
        this.broadcastSpawn(b);
      }
    }

    pickSpawn(p) {
      // Random open spot anywhere on the map; among a few random candidates prefer ones away from others.
      const H = this.map.H - 4;
      let best = null, bestScore = -1, valid = 0;
      for (let i = 0; i < 60 && valid < 6; i++) {
        const x = (Math.random() * 2 - 1) * H, z = (Math.random() * 2 - 1) * H;
        if (!isClear(this.map, x, z, 1)) continue;
        valid++;
        let minD = 1e9;
        for (const q of this.players.values()) {
          if (q === p || !q.alive) continue;
          minD = Math.min(minD, Math.hypot(q.x - x, q.z - z));
        }
        const score = Math.min(minD, 45) + Math.random() * 25;
        if (score > bestScore) { bestScore = score; best = { x, y: 0, z }; }
      }
      if (!best) best = this.map.spawns[Math.floor(Math.random() * this.map.spawns.length)];
      return best || { x: 0, y: 0, z: 0 };
    }

    spawn(p, silent) {
      const s = this.pickSpawn(p);
      p.x = s.x; p.y = s.y; p.z = s.z;
      p.yaw = Math.random() * Math.PI * 2;
      p.pitch = 0;
      p.hp = PLAYER.maxHp; p.alive = true; p.sp++;
      p.protUntil = now() + PLAYER.spawnProtect;
      p.hist.length = 0;
      p.shots.clear();
      if (p.bot) { p.vel.x = p.vel.y = p.vel.z = 0; p.ai.target = null; p.ai.goal = null; }
      if (!silent) this.broadcastSpawn(p);
    }
    broadcastSpawn(p) {
      this.broadcast({ t: 'spawn', id: p.id, x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(p.yaw), sp: p.sp });
    }

    // ───── Incoming client messages ─────
    handle(client, msg) {
      const p = client.player;
      if (!p || !msg || typeof msg !== 'object') return;
      switch (msg.t) {
        case 'u': return this.onState(p, msg);
        case 'f': return this.onFire(p, msg);
        case 'h': return this.onHit(p, msg);
        case 'pk': return this.onPickup(p, msg);
        case 'w': if (Number.isInteger(msg.w) && WEAPONS[msg.w]) p.w = msg.w; return;
        case 'p': if (typeof msg.r === 'number') p.ping = Math.min(999, Math.max(0, msg.r | 0));
          return this.send(p, { t: 'P', c: msg.c, T: now() });
        case 'c': {
          const text = String(msg.m || '').slice(0, 90).trim();
          if (text && now() - (p.lastChat || 0) > 700) { p.lastChat = now(); this.broadcast({ t: 'c', id: p.id, m: text }); }
          return;
        }
      }
    }

    onState(p, m) {
      if (!p.alive || m.sp !== p.sp || this.state !== 'play') return;
      const x = +m.x, y = +m.y, z = +m.z;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
      const H = this.map.H;
      p.x = Math.max(-H, Math.min(H, x));
      p.y = Math.max(0, Math.min(60, y));
      p.z = Math.max(-H, Math.min(H, z));
      p.yaw = +m.yaw || 0; p.pitch = +m.pitch || 0;
      p.flags = m.f | 0;
      if (Number.isInteger(m.w) && WEAPONS[m.w]) p.w = m.w;
      this.pushHistory(p);
    }

    pushHistory(p) {
      const t = now();
      p.hist.push({ t, x: p.x, y: p.y, z: p.z });
      while (p.hist.length && t - p.hist[0].t > HISTORY_MS) p.hist.shift();
    }

    onFire(p, m) {
      if (!p.alive || this.state !== 'play') return;
      const wp = WEAPONS[m.w];
      if (!wp || !Array.isArray(m.o) || !Array.isArray(m.e)) return;
      const t = now();
      if (t - p.lastFire < wp.rate * 0.7) return;
      p.lastFire = t;
      p.w = m.w;
      p.protUntil = 0; // firing ends spawn protection
      const o = m.o.map(Number), e = m.e.map(Number);
      if (![...o, ...e].every(Number.isFinite)) return;
      p.shots.set(m.s | 0, { w: m.w, t, o, hits: wp.pellets });
      if (p.shots.size > 24) p.shots.delete(p.shots.keys().next().value);
      this.broadcast({ t: 'f', id: p.id, w: m.w, o: o.map(r2), e: e.map(r2) }, p);
    }

    onHit(p, m) {
      if (!p.alive || this.state !== 'play') return;
      const shot = p.shots.get(m.s | 0);
      if (!shot || shot.hits <= 0 || now() - shot.t > 1200) return;
      const target = this.players.get(m.id | 0);
      if (!target || target === p || !target.alive) return;
      const pt = Array.isArray(m.pt) ? m.pt.map(Number) : null;
      if (!pt || !pt.every(Number.isFinite)) return;
      // Lag compensation: the claimed hit point must be near where the target was recently.
      const hist = target.hist.length ? target.hist : [{ x: target.x, y: target.y, z: target.z }];
      let near = false;
      for (const h of hist) {
        const dx = pt[0] - h.x, dy = pt[1] - (h.y + 0.9), dz = pt[2] - h.z;
        if (dx * dx + dy * dy + dz * dz < 2.6 * 2.6) { near = true; break; }
      }
      if (!near) {
        const dx = pt[0] - target.x, dy = pt[1] - (target.y + 0.9), dz = pt[2] - target.z;
        if (dx * dx + dy * dy + dz * dz > 3.2 * 3.2) return;
      }
      // Line of sight from the shot origin to the hit point.
      const [ox, oy, oz] = shot.o;
      let dx = pt[0] - ox, dy = pt[1] - oy, dz = pt[2] - oz;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 0.01) {
        dx /= dist; dy /= dist; dz /= dist;
        if (rayMap(this.map, ox, oy, oz, dx, dy, dz, dist) < dist - 0.6) return;
      }
      shot.hits--;
      this.applyDamage(target, p, weaponDamage(shot.w, dist, !!m.hs), shot.w, !!m.hs);
    }

    applyDamage(target, attacker, amount, w, hs) {
      if (!target.alive || this.state !== 'play') return;
      if (now() < target.protUntil) return;
      amount = Math.max(1, Math.round(amount));
      target.hp -= amount;
      target.lastDamaged = now();
      attacker.dmg += amount;
      const dmsg = { t: 'd', v: target.id, a: attacker.id, n: amount, hp: Math.max(0, target.hp), hs: hs ? 1 : 0, ax: r2(attacker.x), az: r2(attacker.z) };
      this.send(target, dmsg);
      if (attacker !== target) this.send(attacker, dmsg);
      if (target.bot && attacker !== target) { target.ai.target = attacker.id; target.ai.seenAt = now(); }
      if (target.hp <= 0) this.kill(target, attacker, w, hs);
    }

    kill(victim, killer, w, hs) {
      victim.alive = false;
      victim.hp = 0;
      victim.deaths++;
      victim.streak = 0;
      victim.deadUntil = now() + PLAYER.respawnTime;
      if (killer !== victim) { killer.kills++; killer.streak++; }
      this.broadcast({ t: 'k', a: killer.id, v: victim.id, w, hs: hs ? 1 : 0, st: killer.streak });
      if (killer.kills >= KILL_GOAL) this.endMatch();
    }

    onPickup(p, m) {
      const pk = this.pickups[m.i | 0];
      if (!pk || !pk.on || !p.alive || this.state !== 'play') return;
      if ((p.x - pk.x) ** 2 + (p.z - pk.z) ** 2 > 3.5 * 3.5 || Math.abs(p.y - pk.y) > 3) return;
      this.takePickup(p, m.i | 0);
    }
    takePickup(p, i) {
      const pk = this.pickups[i];
      if (pk.type === 'hp') {
        if (p.hp >= PLAYER.maxHp) return;
        p.hp = Math.min(PLAYER.maxHp, p.hp + 50);
      }
      pk.on = false;
      pk.respawnAt = now() + PICKUP_RESPAWN;
      this.broadcast({ t: 'pk', i, on: 0, by: p.id, hp: p.hp });
    }

    // ───── Simulation tick ─────
    tick() {
      const t = now();
      if (this.state === 'end') {
        if (t >= this.nextStartAt) this.startMatch(false);
        else return;
      }
      if (t >= this.matchEndsAt) { this.endMatch(); return; }

      for (const p of this.players.values()) {
        if (!p.alive) {
          if (t >= p.deadUntil) this.spawn(p);
          continue;
        }
        if (p.hp < PLAYER.maxHp && t - p.lastDamaged > PLAYER.regenDelay) {
          p.hp = Math.min(PLAYER.maxHp, p.hp + PLAYER.regenRate * TICK_MS / 1000);
        }
        if (p.bot) this.botThink(p, t);
      }
      for (let i = 0; i < this.pickups.length; i++) {
        const pk = this.pickups[i];
        if (!pk.on && t >= pk.respawnAt) { pk.on = true; this.broadcast({ t: 'pk', i, on: 1 }); }
      }
      // Snapshot of everyone (compact arrays).
      const ps = [];
      for (const p of this.players.values()) {
        ps.push([p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), (p.flags & ~16) | (p.alive ? 0 : 16) | (t < p.protUntil ? 32 : 0), p.w, Math.ceil(p.hp), p.ping]);
      }
      this.broadcast({ t: 's', T: t, p: ps });
    }

    // ───── Bots ─────
    visible(a, b) {
      const ox = a.x, oy = a.y + PLAYER.eye, oz = a.z;
      let dx = b.x - ox, dy = b.y + 1.2 - oy, dz = b.z - oz;
      const d = Math.hypot(dx, dy, dz);
      if (d > 45) return false;
      dx /= d; dy /= d; dz /= d;
      return rayMap(this.map, ox, oy, oz, dx, dy, dz, d) >= d - 0.3;
    }

    botThink(b, t) {
      const ai = b.ai, dt = TICK_MS / 1000, map = this.map;
      // Re-evaluate targets a few times per second.
      if (t >= ai.nextThink) {
        ai.nextThink = t + 220;
        let best = null, bestD = 1e9;
        for (const q of this.players.values()) {
          if (q === b || !q.alive || t < q.protUntil) continue;
          const d = (q.x - b.x) ** 2 + (q.z - b.z) ** 2;
          if (d < bestD && this.visible(b, q)) { bestD = d; best = q; }
        }
        if (best) {
          if (ai.target !== best.id || t - ai.seenAt > 1500) ai.reactAt = t + (900 + Math.random() * 900) / ai.skill;
          ai.target = best.id; ai.seenAt = t; ai.hasLos = true;
        } else ai.hasLos = false;
        // Stuck detection
        if ((b.x - ai.lastX) ** 2 + (b.z - ai.lastZ) ** 2 < 0.05 && !ai.hasLos) { ai.goal = null; ai.jumpNow = true; }
        ai.lastX = b.x; ai.lastZ = b.z;
      }
      const target = ai.target ? this.players.get(ai.target) : null;
      const engaged = target && target.alive && ai.hasLos && t - ai.seenAt < 600;

      // Choose where to go.
      let gx, gz;
      if (engaged) {
        const dx = target.x - b.x, dz = target.z - b.z;
        const d = Math.hypot(dx, dz) || 1;
        if (t > ai.strafeUntil) { ai.strafe = Math.random() < 0.5 ? -1 : 1; ai.strafeUntil = t + 500 + Math.random() * 1100; }
        const fwd = d > 24 ? 1 : d < 9 ? -1 : 0;
        gx = (dx / d) * fwd + (-dz / d) * ai.strafe;
        gz = (dz / d) * fwd + (dx / d) * ai.strafe;
        b.yaw = Math.atan2(-dx, -dz);
        b.pitch = Math.atan2(target.y + 1.2 - (b.y + PLAYER.eye), d);
      } else {
        if (!ai.goal || t > ai.goalUntil || (b.x - ai.goal.x) ** 2 + (b.z - ai.goal.z) ** 2 < 4) {
          let goal = null;
          if (b.hp < 55) {
            const hp = this.pickups.filter((pk) => pk.on && pk.type === 'hp');
            if (hp.length) goal = hp[Math.floor(Math.random() * hp.length)];
          }
          if (!goal && target && target.alive && Math.random() < 0.7) goal = { x: target.x, z: target.z };
          if (!goal) {
            const others = [...this.players.values()].filter((q) => q !== b && q.alive);
            if (others.length && Math.random() < 0.6) { const q = others[Math.floor(Math.random() * others.length)]; goal = { x: q.x, z: q.z }; }
            else { const s = map.spawns[Math.floor(Math.random() * map.spawns.length)]; goal = { x: s.x, z: s.z }; }
          }
          ai.goal = { x: goal.x, z: goal.z };
          ai.goalUntil = t + 3500 + Math.random() * 3000;
        }
        const dx = ai.goal.x - b.x, dz = ai.goal.z - b.z;
        const d = Math.hypot(dx, dz) || 1;
        gx = dx / d; gz = dz / d;
        const targetYaw = Math.atan2(-gx, -gz);
        let dyaw = targetYaw - b.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        b.yaw += dyaw * Math.min(1, dt * 8);
        b.pitch *= 0.8;
      }
      // Obstacle avoidance: probe ahead, steer around walls, hop over low cover.
      const gl = Math.hypot(gx, gz);
      if (gl > 0.01) {
        gx /= gl; gz /= gl;
        const probe = (ax, az) => rayMap(map, b.x, b.y + 0.9, b.z, ax, 0, az, 2.2) < 2.2;
        if (probe(gx, gz)) {
          const lowOnly = rayMap(map, b.x, b.y + 2.1, b.z, gx, 0, gz, 2.2) >= 2.2;
          if (lowOnly && b.phys.onGround) ai.jumpNow = true;
          else {
            for (const a of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9, Math.PI]) {
              const c = Math.cos(a), s = Math.sin(a);
              const nx = gx * c - gz * s, nz = gx * s + gz * c;
              if (!probe(nx, nz)) { gx = nx; gz = nz; break; }
            }
          }
        }
      }
      // Movement physics (same as players).
      const speed = PLAYER.run * (engaged ? 0.75 : 0.9);
      const k = Math.min(1, (b.phys.onGround ? 12 : 3) * dt);
      b.vel.x += (gx * speed - b.vel.x) * k;
      b.vel.z += (gz * speed - b.vel.z) * k;
      if (ai.jumpNow && b.phys.onGround) { b.vel.y = map.jump; ai.jumpNow = false; }
      b.vel.y -= map.gravity * dt;
      checkPads(b, b.vel, map);
      moveBody(b, b.vel, dt, map, b.phys);
      b.flags = (Math.hypot(b.vel.x, b.vel.z) > 1 ? 1 : 0) | (b.phys.onGround ? 0 : 4);
      b.w = 0;
      this.pushHistory(b);

      // Pickups
      for (let i = 0; i < this.pickups.length; i++) {
        const pk = this.pickups[i];
        if (pk.on && (b.x - pk.x) ** 2 + (b.z - pk.z) ** 2 < 2.2 && Math.abs(b.y - pk.y) < 1.5) this.takePickup(b, i);
      }

      // Shooting
      // Easy bots: short bursts with long pauses, slow fire.
      if (engaged && t >= ai.reactAt && t >= ai.restUntil && !ai.burstUntil) ai.burstUntil = t + 700 + Math.random() * 600;
      if (ai.burstUntil && t > ai.burstUntil) { ai.burstUntil = 0; ai.restUntil = t + 1400 + Math.random() * 1600; }
      if (engaged && ai.burstUntil && t >= ai.nextFire) {
        ai.nextFire = t + 260 + Math.random() * 220;
        b.protUntil = 0;
        const dx = target.x - b.x, dy = target.y - b.y, dz = target.z - b.z;
        const d = Math.hypot(dx, dy, dz);
        const tSpeed = target.hist.length > 1 ? Math.hypot(target.x - target.hist[0].x, target.z - target.hist[0].z) / Math.max(0.1, (t - target.hist[0].t) / 1000) : 0;
        const chance = Math.max(0.03, Math.min(0.2, (0.24 - d * 0.005 - tSpeed * 0.02) * ai.skill));
        const hit = Math.random() < chance;
        const ox = b.x, oy = b.y + 1.45, oz = b.z;
        let ex = target.x, ey = target.y + 1.1, ez = target.z;
        if (!hit) { ex += (Math.random() - 0.5) * 5; ey += (Math.random() - 0.2) * 2.5; ez += (Math.random() - 0.5) * 5; }
        this.broadcast({ t: 'f', id: b.id, w: 0, o: [r2(ox), r2(oy), r2(oz)], e: [r2(ex), r2(ey), r2(ez)] });
        if (hit) {
          const hs = Math.random() < 0.05;
          // Weak against humans (easy practice), stronger against other bots so the killfeed stays lively.
          this.applyDamage(target, b, target.bot ? (hs ? 30 : 20) : (hs ? 9 : 6), 0, hs);
        }
      }
    }
  }

  return { Room, TICK_MS };
});
