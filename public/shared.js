// VECK.IO shared game data + physics. Loaded by the browser (window.VECK) and by the Node server (require).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VECK = Object.assign(root.VECK || {}, api);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ───── Player dimensions & movement ─────
  const PLAYER = {
    radius: 0.42,
    height: 1.85,
    eye: 1.62,
    headBottom: 1.42,      // head hitbox spans headBottom..height
    headHalf: 0.3,
    bodyHalf: 0.5,
    run: 10.5,
    accelGround: 90,
    accelAir: 22,
    friction: 10,
    slideBoost: 17,
    slideTime: 0.75,
    dashSpeed: 24,
    dashCooldown: 2.2,
    stepHeight: 0.6,
    maxHp: 100,
    regenDelay: 4500,
    regenRate: 18,          // hp per second
    respawnTime: 2800,
    spawnProtect: 1500,
  };

  // ───── Weapons ─────
  const WEAPONS = [
    { name: 'VK-12 PULSE RIFLE', short: 'RIFLE',   auto: true,  rate: 100,  dmg: 20, head: 1.6, mag: 30, reserve: 180, reload: 1450, spread: 0.022, adsSpread: 0.004, pellets: 1, falloff: [45, 110, 0.65], adsFov: 52, recoil: 0.011, speed: 1.0,  color: 0x00f0ff },
    { name: 'SPECTRE SMG',       short: 'SMG',     auto: true,  rate: 66,   dmg: 13, head: 1.5, mag: 36, reserve: 216, reload: 1250, spread: 0.034, adsSpread: 0.014, pellets: 1, falloff: [20, 55, 0.5],   adsFov: 62, recoil: 0.007, speed: 1.08, color: 0x00ff88 },
    { name: 'BREACHER SHOTGUN',  short: 'SHOTGUN', auto: false, rate: 780,  dmg: 11, head: 1.3, mag: 7,  reserve: 49,  reload: 1900, spread: 0.07,  adsSpread: 0.052, pellets: 9, falloff: [8, 28, 0.3],    adsFov: 66, recoil: 0.05,  speed: 1.04, color: 0xffaa00 },
    { name: 'ION SNIPER',        short: 'SNIPER',  auto: false, rate: 1050, dmg: 85, head: 2.2, mag: 5,  reserve: 30,  reload: 2100, spread: 0.05,  adsSpread: 0.0,   pellets: 1, falloff: null,            adsFov: 22, recoil: 0.06,  speed: 0.93, color: 0xff0055, scope: true },
  ];

  function weaponDamage(w, dist, headshot) {
    const wp = WEAPONS[w];
    if (!wp) return 0;
    let mult = 1;
    if (wp.falloff) {
      const [a, b, min] = wp.falloff;
      const k = Math.min(1, Math.max(0, (dist - a) / (b - a)));
      mult = 1 + (min - 1) * k;
    }
    return Math.round(wp.dmg * mult * (headshot ? wp.head : 1));
  }

  const SKINS = {
    CYBER:  { color: 0x00f0ff, hex: '#00f0ff' },
    PLASMA: { color: 0xff0055, hex: '#ff0055' },
    GOLD:   { color: 0xffc400, hex: '#ffc400' },
    VOID:   { color: 0xa45cff, hex: '#a45cff' },
    TOXIC:  { color: 0x39ff14, hex: '#39ff14' },
  };

  // ───── Map construction helpers ─────
  // B(x, z, w, d, h, y): box centered on x/z, sized w (x) by d (z), from height y to y+h.
  function B(x, z, w, d, h, y = 0, c = 0) {
    return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y, maxY: y + h, c };
  }
  // Rotate a box 90° n times about the origin.
  function rotBox(b, n) {
    let { minX, maxX, minZ, maxZ } = b;
    for (let i = 0; i < n; i++) {
      // (x, z) -> (-z, x)
      const nMinX = -maxZ, nMaxX = -minZ, nMinZ = minX, nMaxZ = maxX;
      minX = nMinX; maxX = nMaxX; minZ = nMinZ; maxZ = nMaxZ;
    }
    return { minX, maxX, minZ, maxZ, minY: b.minY, maxY: b.maxY, c: b.c };
  }
  function rot4(boxes) {
    const out = [];
    for (const b of boxes) for (let n = 0; n < 4; n++) out.push(rotBox(b, n));
    return out;
  }
  function rotPt(p, n) {
    let [x, z] = p;
    for (let i = 0; i < n; i++) { const nx = -z, nz = x; x = nx; z = nz; }
    return [x, z, ...p.slice(2)];
  }
  function rot4Pads(pads) {
    const out = [];
    for (const p of pads) for (let n = 0; n < 4; n++) {
      const [x, z] = rotPt([p[0], p[1]], n), [tx, tz] = rotPt([p[2], p[3]], n);
      out.push([x, z, tx, tz, p[4]]);
    }
    return out;
  }
  function rot4Pts(pts) {
    const out = [];
    for (const p of pts) for (let n = 0; n < 4; n++) out.push(rotPt(p, n));
    return out;
  }
  function boundary(H, h = 14) {
    return [
      B(0, H + 1, 2 * H + 4, 2, h, 0, 3), B(0, -H - 1, 2 * H + 4, 2, h, 0, 3),
      B(H + 1, 0, 2, 2 * H + 4, h, 0, 3), B(-H - 1, 0, 2, 2 * H + 4, h, 0, 3),
    ];
  }

  // Map themes: palette c0..c3 for boxes (c3 = boundary walls).
  const MAP_DEFS = {
    NEON: {
      name: 'NEON METROPOLIS', H: 50, floor: 'grid', edges: true, deco: 'skyline', gravity: 26, jump: 10,
      sky: 0x0b1030, fog: 0x0b1030, fogNear: 40, fogFar: 150, ground: 0x111a3a, grid: 0x00f0ff,
      ambient: 0x8090c0, sun: 0xbfe8ff, edge: 0x00f0ff,
      palette: [0x26305e, 0x3a2d6a, 0x1d4a6a, 0x161d3d],
      build() {
        const boxes = [
          B(0, 0, 10, 10, 2.4, 0, 1),
          B(0, 0, 4, 0.6, 1.1, 2.4, 2),
          ...rot4([
            B(6.5, 0, 3, 3, 1.2, 0, 2),
            B(22, 22, 10, 10, 9, 0, 0),
            B(0, 24, 12, 1, 1.4, 0, 2),
            B(12, 10, 2.5, 2.5, 1.3, 0, 2),
            B(12, 12.5, 2.5, 2.5, 2.6, 0, 1),
            B(36, 0, 1.2, 16, 4, 0, 0),
            B(30, -14, 2, 2, 6, 0, 2),
            B(40, 40, 7, 7, 6, 0, 1),
            B(24, 0, 3, 6, 2.2, 0, 2),
            B(44, 22, 4, 2, 1.3, 0, 2),
          ]),
          ...boundary(50),
        ];
        return {
          boxes,
          pads: rot4Pads([[33, 33, 40, 40, 6]]),             // x, z, targetX, targetZ, targetY
          spawns: rot4Pts([[0, 42], [42, 12], [16, 32]]),
          pickups: [[3, 3, 2.4, 'hp'], ...rot4Pts([[24, 8, 0, 'ammo'], [12, -22, 0, 'hp']])],
        };
      },
    },
    ORBITAL: {
      name: 'ORBITAL APEX', H: 48, floor: 'plates', edges: true, deco: 'planet', gravity: 15, jump: 8.6,
      sky: 0x0a0820, fog: 0x0a0820, fogNear: 40, fogFar: 140, ground: 0x15112e, grid: 0xb070ff,
      ambient: 0x9080c0, sun: 0xe0c8ff, edge: 0xc080ff,
      palette: [0x302657, 0x45306e, 0x22305a, 0x1a1534],
      build() {
        const boxes = [
          B(0, 0, 12, 12, 5, 0, 1),
          B(0, 0, 3, 3, 1.4, 5, 2),
          ...rot4([
            B(16, 16, 8, 8, 2.5, 0, 0),
            B(30, 0, 2, 14, 5, 0, 0),
            B(27, 27, 4, 4, 8, 0, 2),
            B(0, 21, 6, 1, 1.5, 0, 2),
            B(39, 22, 6, 6, 4.5, 0, 1),
            B(9, 34, 3, 3, 1.5, 0, 2),
            B(39, -8, 4, 4, 2.4, 0, 2),
          ]),
          ...boundary(48),
        ];
        return {
          boxes,
          pads: rot4Pads([[0, 11, 0, 3, 5], [33, 22, 39, 22, 4.5]]),
          spawns: rot4Pts([[0, 41], [41, 36], [20, 30]]),
          pickups: [[0, 0, 6.4, 'hp'], ...rot4Pts([[16, 16, 2.5, 'ammo'], [24, -12, 0, 'hp']])],
        };
      },
    },
    MAGMA: {
      name: 'VOLCANIC CORE', H: 46, floor: 'rock', edges: true, deco: 'lava', gravity: 26, jump: 10,
      sky: 0x1e0805, fog: 0x2a0c06, fogNear: 30, fogFar: 125, ground: 0x24100b, grid: 0xff4400,
      ambient: 0xc08070, sun: 0xffb080, edge: 0xff5a1a,
      palette: [0x4a1c14, 0x5e2a16, 0x3a1612, 0x2a0e0a],
      build() {
        const boxes = [
          ...rot4([
            B(10, 10, 6, 6, 4, 0, 0),
            B(0, 18, 8, 1, 1.4, 0, 2),
            B(24, 8, 1, 16, 5, 0, 0),
            B(24, 30, 8, 8, 3, 0, 1),
            B(19, 30, 2, 2, 1.3, 0, 2),
            B(36, 0, 4, 4, 2, 0, 2),
            B(36, 18, 2, 6, 3.5, 0, 1),
            B(12, 38, 6, 2, 2.2, 0, 2),
          ]),
          ...boundary(46),
        ];
        return {
          boxes,
          pads: [[0, 0, 0, 0, 0]],
          spawns: rot4Pts([[0, 42], [38, 30], [17, 20]]),
          pickups: [[0, 6, 0, 'hp'], [0, -6, 0, 'hp'], ...rot4Pts([[24, 30, 3, 'ammo'], [36, 10, 0, 'hp']])],
        };
      },
    },
    MATRIX: {
      name: 'CYBER MATRIX', H: 52, floor: 'grid', edges: true, deco: 'rain', gravity: 22, jump: 10,
      sky: 0x020a0c, fog: 0x031014, fogNear: 40, fogFar: 150, ground: 0x061418, grid: 0x00ffaa,
      ambient: 0x70c0b0, sun: 0xc0fff0, edge: 0x00ffaa,
      palette: [0x0f2e36, 0x123d3a, 0x0c2430, 0x081a20],
      build() {
        const boxes = [B(0, 0, 6, 6, 1.2, 0, 1), B(0, 0, 3, 3, 1.2, 1.2, 2)];
        const heights = [1.2, 3.5, 6, 2.4];
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
          if (i === 0 && j === 0) continue;
          const h = heights[(Math.abs(i) + 2 * Math.abs(j)) % 4];
          boxes.push(B(i * 16, j * 16, 4, 4, h, 0, h > 3 ? 0 : 2));
        }
        boxes.push(...rot4([
          B(0, 40, 16, 1, 3, 0, 0),
          B(8, 8, 5, 5, 0.6, 3.2, 1),
          B(24, 40, 2, 2, 1.3, 0, 2),
        ]));
        boxes.push(...boundary(52));
        return {
          boxes,
          pads: rot4Pads([[8, 0, 8, 8, 3.8]]),
          spawns: rot4Pts([[0, 46], [46, 46], [24, 24]]),
          pickups: [[0, 0, 2.4, 'hp'], ...rot4Pts([[8, 8, 3.8, 'ammo'], [24, 8, 0, 'hp']])],
        };
      },
    },
  };

  // ───── Procedural big maps (seeded, 4-way rotational symmetry) ─────
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const overlaps = (a, b, m) => a.minX - m < b.maxX && a.maxX + m > b.minX && a.minZ - m < b.maxZ && a.maxZ + m > b.minZ && a.minY < b.maxY && a.maxY > b.minY;
  // Place a box inside the +X/+Z quadrant if it keeps `gap` meters from everything already placed.
  function placer(H) {
    const quad = [], reserved = [];
    return {
      quad,
      reserve(x, z, r = 2.5) { reserved.push(B(x, z, r * 2, r * 2, 50, 0)); },
      tryAdd(b, gap = 2.5, keepCenter = 7) {
        if (b.minX < 1.5 || b.minZ < 1.5 || b.maxX > H - 2.5 || b.maxZ > H - 2.5) return false;
        const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
        if (Math.hypot(cx, cz) < keepCenter) return false;
        for (const q of quad) if (overlaps(b, q, gap)) return false;
        for (const q of reserved) if (overlaps(b, q, 0)) return false;
        quad.push(b);
        return true;
      },
      force(b) { quad.push(b); },
    };
  }

  function buildDowntown() {
    const H = 86, R = rng(7), P = placer(H), pads = [], pickups = [];
    const center = [B(0, 0, 10, 10, 1.1, 0, 2), B(0, 0, 3, 3, 3.5, 1.1, 1)];
    // City blocks on a grid with streets between them.
    for (const gx of [16, 40, 64]) for (const gz of [16, 40, 64]) {
      if (gx === 16 && gz === 16) continue;
      const w = 12 + R() * 5, d = 12 + R() * 5;
      const low = R() < 0.35;
      const h = low ? 5 + R() * 2 : 9 + R() * 16;
      const b = B(gx, gz, w, d, h, 0, low ? 1 : 0);
      if (!P.tryAdd(b, 3)) continue;
      if (low) {
        // Jump pad on the street side launches you onto the roof.
        const side = R() < 0.5;
        const px = side ? gx - w / 2 - 3.5 : gx, pz = side ? gz : gz - d / 2 - 3.5;
        if (px > 3 && pz > 3) { pads.push([px, pz, gx, gz, h]); P.reserve(px, pz); pickups.push([gx + 2, gz + 2, h, R() < 0.5 ? 'hp' : 'ammo']); }
        P.force(B(gx, gz, 2.2, 0.8, 1.1, h, 2)); // rooftop cover
      } else if (R() < 0.5) {
        P.force(B(gx, gz, w - 2, d - 2, 1.5, h, 2)); // rooftop detail
      }
    }
    // Street clutter: cars, barriers, crates.
    for (let i = 0; i < 70; i++) {
      const x = 4 + R() * (H - 8), z = 4 + R() * (H - 8);
      const t = R();
      const b = t < 0.45 ? (R() < 0.5 ? B(x, z, 4.2, 2, 1.5, 0, 1) : B(x, z, 2, 4.2, 1.5, 0, 1))
        : t < 0.75 ? B(x, z, 1.6, 1.6, 1.3, 0, 2)
        : (R() < 0.5 ? B(x, z, 6, 0.6, 1.2, 0, 2) : B(x, z, 0.6, 6, 1.2, 0, 2));
      P.tryAdd(b, 2.2, 6);
    }
    for (let i = 0; i < 4; i++) pickups.push([28 + i * 12, 4 + R() * 8, 0, i % 2 ? 'ammo' : 'hp']);
    return { boxes: [...center, ...rot4(P.quad), ...boundary(H, 30)], pads: rot4Pads(pads), spawns: [], pickups: rot4Pts(pickups), H };
  }

  function buildDepot() {
    const H = 80, R = rng(21), P = placer(H), pickups = [];
    P.force(B(H - 12, H - 12, 4, 4, 14, 0, 3)); // crane tower
    P.reserve(H - 18, H - 12);
    const center = [B(0, 0, 6, 6, 9, 0, 0), B(0, 0, 12, 12, 0.5, 0, 2)];
    // Shipping containers, some stacked; crates beside them act as steps.
    for (let i = 0; i < 90; i++) {
      const len = 7 + R() * 6, along = R() < 0.5;
      const x = 6 + R() * (H - 12), z = 6 + R() * (H - 12);
      const b = along ? B(x, z, len, 2.7, 2.7, 0, R() < 0.5 ? 0 : 1) : B(x, z, 2.7, len, 2.7, 0, R() < 0.5 ? 0 : 1);
      if (!P.tryAdd(b, 3.2, 9)) continue;
      if (R() < 0.35) P.force(along ? B(x + (R() - 0.5) * 2, z, len * 0.7, 2.7, 2.7, 2.7, 1) : B(x, z + (R() - 0.5) * 2, 2.7, len * 0.7, 2.7, 2.7, 1));
      if (R() < 0.6) P.force(along ? B(x - len / 2 - 0.8, z, 1.6, 1.6, 1.35, 0, 2) : B(x, z - len / 2 - 0.8, 1.6, 1.6, 1.35, 0, 2));
    }
    // Crane towers
    const pads = [[H - 18, H - 12, H - 12, H - 12, 14]];
    pickups.push([H - 12, H - 12, 14, 'ammo']);
    for (let i = 0; i < 5; i++) pickups.push([10 + R() * (H - 20), 4 + R() * 3, 0, i % 2 ? 'ammo' : 'hp']);
    return { boxes: [...center, ...rot4(P.quad), ...boundary(H, 18)], pads: rot4Pads(pads), spawns: [], pickups: rot4Pts(pickups), H };
  }

  function buildSkyGardens() {
    const H = 78, R = rng(99), P = placer(H), pads = [], pickups = [];
    const center = [B(0, 0, 14, 14, 3, 0, 1), B(0, 0, 6, 6, 2, 3, 2)];
    // Floating terraces: chains of platforms each a jumpable step above the last.
    for (let c = 0; c < 6; c++) {
      let x = 12 + R() * (H - 30), z = 12 + R() * (H - 30), y = 2;
      const first = B(x, z, 7, 7, 0.8, y, 1);
      if (!P.tryAdd(first, 3, 12)) continue;
      pads.push([x - 6.5, z, x, z, y + 0.8]);
      P.reserve(x - 6.5, z);
      for (let k = 0; k < 3; k++) {
        const nx = x + (R() - 0.5) * 16, nz = z + (R() - 0.5) * 16, ny = y + 1.4 + R() * 0.6;
        const b = B(nx, nz, 6 + R() * 4, 6 + R() * 4, 0.8, ny, k === 2 ? 2 : 1);
        if (!P.tryAdd(b, 1.2, 12)) break;
        x = nx; z = nz; y = ny;
      }
      pickups.push([x, z, y + 0.8, c % 2 ? 'hp' : 'ammo']);
    }
    // Trees and hedges on the ground
    for (let i = 0; i < 50; i++) {
      const x = 4 + R() * (H - 8), z = 4 + R() * (H - 8);
      if (R() < 0.5) { if (P.tryAdd(B(x, z, 1, 1, 6, 0, 0), 2.5, 9)) P.force(B(x, z, 4, 4, 2.5, 6, 2)); }
      else P.tryAdd(R() < 0.5 ? B(x, z, 7, 1.2, 1.4, 0, 1) : B(x, z, 1.2, 7, 1.4, 0, 1), 2.5, 9);
    }
    pickups.push([20, 6, 0, 'hp']);
    return { boxes: [...center, ...rot4(P.quad), ...boundary(H, 20)], pads: rot4Pads(pads), spawns: [], pickups: rot4Pts(pickups), H };
  }

  function buildRuins() {
    const H = 82, R = rng(1337), P = placer(H), pickups = [];
    const center = [B(0, 0, 16, 16, 0.6, 0, 2), B(0, 0, 2.5, 2.5, 8, 0.6, 0)];
    P.reserve(10.5, 10.5);
    // Ruined rooms: 3 walls with a doorway gap.
    for (let i = 0; i < 9; i++) {
      const x = 10 + R() * (H - 22), z = 10 + R() * (H - 22), s = 8 + R() * 6, h = 2.5 + R() * 2;
      const walls = [B(x, z - s / 2, s, 0.9, h, 0, 0), B(x - s / 2, z, 0.9, s, h * 0.8, 0, 0), B(x + s / 2, z + s / 4, 0.9, s / 2, h * 0.6, 0, 0)];
      if (walls.every((w) => P.quad.every((q) => !overlaps(w, q, 3))) && walls.every((w) => w.minX > 1.5 && w.minZ > 1.5 && w.maxX < H - 2.5 && w.maxZ < H - 2.5)) {
        walls.forEach((w) => P.force(w));
        pickups.push([x, z, 0, i % 2 ? 'hp' : 'ammo']);
      }
    }
    // Pillars, broken wall segments, dunes
    for (let i = 0; i < 80; i++) {
      const x = 4 + R() * (H - 8), z = 4 + R() * (H - 8), t = R();
      const b = t < 0.25 ? B(x, z, 1.6, 1.6, 3 + R() * 6, 0, 0)
        : t < 0.6 ? (R() < 0.5 ? B(x, z, 4 + R() * 8, 1, 1.2 + R() * 2.4, 0, 1) : B(x, z, 1, 4 + R() * 8, 1.2 + R() * 2.4, 0, 1))
        : B(x, z, 6 + R() * 6, 6 + R() * 6, 0.55, 0, 2);
      P.tryAdd(b, 2.4, 10);
    }
    const pads = [[10.5, 10.5, 0, 1.4, 8.6]];
    pickups.push([0, 0, 8.6, 'hp']);
    return { boxes: [...center, ...rot4(P.quad), ...boundary(H, 16)], pads: rot4Pads(pads).slice(0, 4), spawns: [], pickups: rot4Pts(pickups).filter((p, i, a) => !(p[0] === 0 && p[1] === 0 && a.findIndex((q) => q[0] === 0 && q[1] === 0) !== i)), H };
  }


  function buildSquid() {
    const H = 72;
    const boxes = [];
    // Central tower with a railing; Escher-style pastel staircases climb to it from all four sides.
    boxes.push(B(0, 0, 10, 10, 6, 0, 0));
    boxes.push(B(0, 0, 3, 3, 1.2, 6, 2));
    const quad = [];
    for (let i = 0; i < 12; i++) quad.push(B(0, 19.4 - i * 1.2, 3.2, 1.2, 0.5 * (i + 1), 0, i % 2 ? 0 : 1));
    // Landing + second flight turning sideways, up to a side balcony
    quad.push(B(12, 26, 8, 6, 3, 0, 1));
    for (let i = 0; i < 5; i++) quad.push(B(7.4 - i * 1.2, 26, 1.2, 3.2, 0.5 * (i + 1), 0, i % 2 ? 1 : 2));
    // Glass bridge: diagonal stepping panels from the tower corner to a lookout platform.
    for (let k = 0; k < 7; k++) quad.push(B(7.5 + k * 3, 7.5 + k * 3, 2.2, 2.2, 0.25, 5.75, 3));
    quad.push(B(32, 32, 9, 9, 6, 0, 2));
    // Playground: low colored walls and shape markers (circle/triangle/square game).
    quad.push(B(30, 8, 10, 1, 1.3, 0, 0), B(44, 18, 1, 10, 1.3, 0, 1), B(50, 40, 6, 6, 2.2, 0, 0), B(22, 48, 8, 1, 1.4, 0, 2));
    quad.push(B(56, 6, 2.5, 2.5, 1.2, 0, 1), B(60, 26, 2.5, 2.5, 2.4, 0, 2), B(40, 56, 12, 1, 3.5, 0, 0), B(14, 40, 2, 2, 4, 0, 1));
    boxes.push(...rot4(quad));
    // The giant doll stands on the far side (collision column; the figure is drawn by the client).
    boxes.push(B(0, -H + 7, 4, 4, 2, 0, 3));
    boxes.push(...boundary(H, 22));
    return {
      boxes,
      pads: rot4Pads([[40, 32, 32, 32, 6], [26, 36, 0, 3, 6]]),
      spawns: [],
      pickups: [[3, -3, 6, 'hp'], ...rot4Pts([[32, 32, 6, 'ammo'], [30, 20, 0, 'hp'], [56, 52, 0, 'ammo']])],
      H,
    };
  }

  Object.assign(MAP_DEFS, {
    SQUID: {
      name: 'SQUID PLAYGROUND', H: 72, floor: 'sand', edges: false, deco: 'squid', gravity: 26, jump: 10,
      sky: 0x8fd3f5, fog: 0xbfe6fa, fogNear: 70, fogFar: 240, ground: 0xe0c08a, grid: 0xffe0a0,
      ambient: 0xfff4f0, sun: 0xffffff, edge: 0xffffff,
      palette: [0xf06a9a, 0x3fc7a6, 0xf5c542, 0x9fdcff],
      build: buildSquid,
    },
    DOWNTOWN: {
      name: 'DOWNTOWN SPRAWL', H: 86, floor: 'asphalt', edges: true, deco: 'skyline', gravity: 26, jump: 10,
      sky: 0x10122a, fog: 0x14162e, fogNear: 60, fogFar: 230, ground: 0x1a1c2c, grid: 0xff2bd6,
      ambient: 0x9a90c0, sun: 0xffe0f0, edge: 0xff2bd6,
      palette: [0x444a7c, 0x5c4486, 0x34608a, 0x1c2040],
      build: buildDowntown,
    },
    DEPOT: {
      name: 'FROZEN DEPOT', H: 80, floor: 'snow', edges: false, deco: 'snow', gravity: 26, jump: 10,
      sky: 0x9fb8d0, fog: 0xa8c0d8, fogNear: 50, fogFar: 210, ground: 0xcfe0ee, grid: 0x6fb0ff,
      ambient: 0xe0f0ff, sun: 0xffffff, edge: 0x3a80d0,
      palette: [0x3d6e9c, 0xb04a3a, 0x7a8a99, 0x4a5a6a],
      build: buildDepot,
    },
    SKY: {
      name: 'SKY GARDENS', H: 78, floor: 'grass', edges: false, deco: 'clouds', gravity: 16, jump: 9,
      sky: 0x6ab0e0, fog: 0x8cc4ea, fogNear: 60, fogFar: 220, ground: 0x2f6a3a, grid: 0x9cff9c,
      ambient: 0xd0f0ff, sun: 0xfff4d0, edge: 0xffffff,
      palette: [0x6b4a2e, 0xd8d0c0, 0x3a8a44, 0x88a0b0],
      build: buildSkyGardens,
    },
    RUINS: {
      name: 'DESERT RUINS', H: 82, floor: 'sand', edges: false, deco: 'dunes', gravity: 26, jump: 10,
      sky: 0xe0a060, fog: 0xe8b47a, fogNear: 50, fogFar: 220, ground: 0xc8a066, grid: 0xffe0a0,
      ambient: 0xfff0d0, sun: 0xfff0c0, edge: 0x6a4020,
      palette: [0xa87c4c, 0xc49a62, 0xd8b47c, 0x8a6440],
      build: buildRuins,
    },
  });
  // The original arenas, enlarged.
  MAP_DEFS.NEON.scale = 1.4; MAP_DEFS.ORBITAL.scale = 1.4; MAP_DEFS.MAGMA.scale = 1.45; MAP_DEFS.MATRIX.scale = 1.35;

  const MAP_ORDER = ['SQUID', 'DOWNTOWN', 'NEON', 'DEPOT', 'ORBITAL', 'SKY', 'MAGMA', 'RUINS', 'MATRIX'];

  const mapCache = {};
  function getMap(key) {
    if (mapCache[key]) return mapCache[key];
    const def = Object.assign({}, MAP_DEFS[key] || MAP_DEFS.NEON);
    const built = def.build();
    if (built.H) def.H = built.H;
    const sc = def.scale || 1;
    if (sc !== 1) {
      // Spread the layout out (and widen boxes) without changing heights, so jumps still work.
      built.boxes = built.boxes.map((b) => ({ ...b, minX: b.minX * sc, maxX: b.maxX * sc, minZ: b.minZ * sc, maxZ: b.maxZ * sc }));
      built.pads = built.pads.map(([x, z, tx, tz, ty]) => [x * sc, z * sc, tx * sc, tz * sc, ty]);
      built.spawns = built.spawns.map(([x, z]) => [x * sc, z * sc]);
      built.pickups = built.pickups.map(([x, z, y, t]) => [x * sc, z * sc, y, t]);
      def.H *= sc; def.fogNear *= sc; def.fogFar *= sc;
    }
    // Precompute jump-pad launch velocities so the arc lands on the target point.
    const g = def.gravity;
    built.pads = built.pads.map(([x, z, tx, tz, ty]) => {
      const apex = Math.max(ty + 3.5, 3.5);
      const vy = Math.sqrt(2 * g * apex);
      const tFall = Math.sqrt(2 * (apex - ty) / g);
      const t = vy / g + tFall;
      return { x, z, vx: (tx - x) / t, vz: (tz - z) / t, vy, r: 1.4 };
    });
    built.spawns = built.spawns.map(([x, z]) => ({ x, y: 0, z }));
    const m0 = { boxes: built.boxes, pads: built.pads, H: def.H };
    // Extra random-but-clear ground points: used for random spawns and bot wandering.
    const R = rng(def.H * 1000 + built.boxes.length);
    for (let i = 0; built.spawns.length < 40 && i < 2000; i++) {
      const x = (R() * 2 - 1) * (def.H - 4), z = (R() * 2 - 1) * (def.H - 4);
      if (isClear(m0, x, z, 1.2)) built.spawns.push({ x, y: 0, z });
    }
    built.pickups = built.pickups.map(([x, z, y, type]) => {
      // Ground pickups that ended up inside geometry move to the nearest open spot.
      if (y === 0 && !isClear(m0, x, z, 0.6)) {
        for (let r = 1; r < 20; r += 1) {
          let found = null;
          for (let a = 0; a < 16 && !found; a++) {
            const nx = x + Math.cos(a / 16 * Math.PI * 2) * r, nz = z + Math.sin(a / 16 * Math.PI * 2) * r;
            if (isClear(m0, nx, nz, 0.6)) found = [nx, nz];
          }
          if (found) { x = found[0]; z = found[1]; break; }
        }
      }
      return { x, y, z, type };
    });
    const m = Object.assign({ key }, def, built);
    mapCache[key] = m;
    return m;
  }

  // ───── Physics ─────
  // pos/vel: {x,y,z}. Moves the body through the map, resolving collisions axis by axis with step-up.
  function moveBody(pos, vel, dt, map, st) {
    const r = PLAYER.radius, h = PLAYER.height, boxes = map.boxes;
    st.onGround = false;
    // X axis
    pos.x += vel.x * dt;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (pos.x + r <= b.minX || pos.x - r >= b.maxX || pos.z + r <= b.minZ || pos.z - r >= b.maxZ || pos.y + h <= b.minY || pos.y >= b.maxY) continue;
      if (b.maxY - pos.y <= PLAYER.stepHeight && st.wasGround && !blockedAbove(pos, b.maxY, boxes)) { pos.y = b.maxY; continue; }
      pos.x = vel.x > 0 ? b.minX - r - 1e-4 : (vel.x < 0 ? b.maxX + r + 1e-4 : (pos.x < (b.minX + b.maxX) / 2 ? b.minX - r - 1e-4 : b.maxX + r + 1e-4));
      vel.x = 0;
    }
    // Z axis
    pos.z += vel.z * dt;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (pos.x + r <= b.minX || pos.x - r >= b.maxX || pos.z + r <= b.minZ || pos.z - r >= b.maxZ || pos.y + h <= b.minY || pos.y >= b.maxY) continue;
      if (b.maxY - pos.y <= PLAYER.stepHeight && st.wasGround && !blockedAbove(pos, b.maxY, boxes)) { pos.y = b.maxY; continue; }
      pos.z = vel.z > 0 ? b.minZ - r - 1e-4 : (vel.z < 0 ? b.maxZ + r + 1e-4 : (pos.z < (b.minZ + b.maxZ) / 2 ? b.minZ - r - 1e-4 : b.maxZ + r + 1e-4));
      vel.z = 0;
    }
    // Y axis
    pos.y += vel.y * dt;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (pos.x + r <= b.minX || pos.x - r >= b.maxX || pos.z + r <= b.minZ || pos.z - r >= b.maxZ || pos.y + h <= b.minY || pos.y >= b.maxY) continue;
      if (vel.y <= 0 && pos.y - vel.y * dt >= b.maxY - 0.05 - (st.wasGround ? PLAYER.stepHeight : 0)) {
        pos.y = b.maxY; vel.y = 0; st.onGround = true;
      } else if (vel.y > 0) {
        pos.y = b.minY - h - 1e-4; vel.y = 0;
      } else {
        // Embedded (e.g. spawned inside geometry): pop up on top.
        pos.y = b.maxY; vel.y = 0; st.onGround = true;
      }
    }
    if (pos.y <= 0) { pos.y = 0; if (vel.y < 0) vel.y = 0; st.onGround = true; }
    // Ground probe so walking off tiny gaps keeps us grounded.
    if (!st.onGround && vel.y <= 0) {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (pos.x + r <= b.minX || pos.x - r >= b.maxX || pos.z + r <= b.minZ || pos.z - r >= b.maxZ) continue;
        if (Math.abs(pos.y - b.maxY) < 0.03) { st.onGround = true; break; }
      }
    }
    // Keep inside the arena no matter what.
    const lim = map.H - r;
    if (pos.x > lim) pos.x = lim; else if (pos.x < -lim) pos.x = -lim;
    if (pos.z > lim) pos.z = lim; else if (pos.z < -lim) pos.z = -lim;
    st.wasGround = st.onGround;
  }
  function blockedAbove(pos, newY, boxes) {
    const r = PLAYER.radius, h = PLAYER.height;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (pos.x + r <= b.minX || pos.x - r >= b.maxX || pos.z + r <= b.minZ || pos.z - r >= b.maxZ) continue;
      if (newY + h > b.minY && newY < b.minY) return true;
    }
    return false;
  }

  function checkPads(pos, vel, map) {
    for (const p of map.pads) {
      const dx = pos.x - p.x, dz = pos.z - p.z;
      if (dx * dx + dz * dz < p.r * p.r && pos.y < 0.4 && vel.y <= 0.5) {
        vel.x = p.vx; vel.z = p.vz; vel.y = p.vy;
        return true;
      }
    }
    return false;
  }

  // Slab ray test against an AABB. Returns entry distance or Infinity.
  function rayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, maxT) {
    let tmin = 0, tmax = maxT;
    if (Math.abs(dx) < 1e-9) { if (ox < minX || ox > maxX) return Infinity; }
    else { let a = (minX - ox) / dx, b = (maxX - ox) / dx; if (a > b) { const t = a; a = b; b = t; } if (a > tmin) tmin = a; if (b < tmax) tmax = b; if (tmin > tmax) return Infinity; }
    if (Math.abs(dy) < 1e-9) { if (oy < minY || oy > maxY) return Infinity; }
    else { let a = (minY - oy) / dy, b = (maxY - oy) / dy; if (a > b) { const t = a; a = b; b = t; } if (a > tmin) tmin = a; if (b < tmax) tmax = b; if (tmin > tmax) return Infinity; }
    if (Math.abs(dz) < 1e-9) { if (oz < minZ || oz > maxZ) return Infinity; }
    else { let a = (minZ - oz) / dz, b = (maxZ - oz) / dz; if (a > b) { const t = a; a = b; b = t; } if (a > tmin) tmin = a; if (b < tmax) tmax = b; if (tmin > tmax) return Infinity; }
    return tmin;
  }
  // Nearest hit distance of a ray against the map (walls + floor). dir must be normalized.
  function rayMap(map, ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT;
    if (dy < 0) { const t = -oy / dy; if (t < best) best = t; }
    const boxes = map.boxes;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const t = rayAABB(ox, oy, oz, dx, dy, dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, best);
      if (t < best) best = t;
    }
    return best;
  }
  // Ray vs a player standing at (px,py,pz). Returns {t, head} or null.
  function rayPlayer(ox, oy, oz, dx, dy, dz, px, py, pz, maxT, sliding) {
    const hh = PLAYER.headHalf, bh = PLAYER.bodyHalf;
    const top = sliding ? PLAYER.height - 0.6 : PLAYER.height;
    const headB = top - (PLAYER.height - PLAYER.headBottom);
    const th = rayAABB(ox, oy, oz, dx, dy, dz, px - hh, py + headB, pz - hh, px + hh, py + top, pz + hh, maxT);
    const tb = rayAABB(ox, oy, oz, dx, dy, dz, px - bh, py, pz - bh, px + bh, py + headB, pz + bh, maxT);
    if (th === Infinity && tb === Infinity) return null;
    return th <= tb ? { t: th, head: true } : { t: tb, head: false };
  }

  // True when a player standing on the ground at (x, z) would not touch any box or jump pad.
  function isClear(map, x, z, margin = 1) {
    const r = PLAYER.radius + margin;
    for (const b of map.boxes) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ && b.minY < PLAYER.height + 0.5) return false;
    }
    for (const p of map.pads) {
      const px = p.x !== undefined ? p.x : p[0], pz = p.z !== undefined ? p.z : p[1];
      if ((x - px) ** 2 + (z - pz) ** 2 < 9) return false;
    }
    return Math.abs(x) < map.H - 2 && Math.abs(z) < map.H - 2;
  }

  function sanitizeName(s) {
    return String(s || '').replace(/[^\w\- .]/g, '').trim().slice(0, 14) || 'Operative';
  }
  function sanitizeRoom(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 16) || 'PUBLIC';
  }

  return { PLAYER, WEAPONS, SKINS, MAP_DEFS, MAP_ORDER, getMap, isClear, moveBody, checkPads, rayAABB, rayMap, rayPlayer, weaponDamage, sanitizeName, sanitizeRoom };
});
