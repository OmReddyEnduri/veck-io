// Collision torture test: simulated players run, dash, jump and use pads on every map;
// fails if anyone ever ends up inside a box. Also runs server bots on every map.
const V = require('../public/shared.js');
const { Room } = require('../public/room.js');
const { PLAYER } = V;
const inside = (map, p) => map.boxes.find((b) => p.x + PLAYER.radius - 0.05 > b.minX && p.x - PLAYER.radius + 0.05 < b.maxX && p.z + PLAYER.radius - 0.05 > b.minZ && p.z - PLAYER.radius + 0.05 < b.maxZ && p.y + PLAYER.height - 0.05 > b.minY && p.y + 0.05 < b.maxY);
let failures = 0;
for (const key of V.MAP_ORDER) {
  const map = V.getMap(key);
  let bad = 0, steps = 0;
  for (let n = 0; n < 30; n++) {
    const s = map.spawns[n % map.spawns.length];
    const pos = { x: s.x, y: 0, z: s.z }, vel = { x: 0, y: 0, z: 0 }, st = { onGround: true, wasGround: true };
    let ang = Math.random() * 6.28;
    for (let i = 0; i < 120 * 20; i++) {
      if (Math.random() < 0.01) ang = Math.random() * 6.28;
      const speed = Math.random() < 0.003 ? PLAYER.dashSpeed : PLAYER.run;
      vel.x += (Math.sin(ang) * speed - vel.x) * 0.2; vel.z += (Math.cos(ang) * speed - vel.z) * 0.2;
      if (speed === PLAYER.dashSpeed) { vel.x = Math.sin(ang) * speed; vel.z = Math.cos(ang) * speed; }
      if (st.onGround && Math.random() < 0.02) vel.y = map.jump;
      vel.y -= map.gravity / 120;
      V.checkPads(pos, vel, map);
      V.moveBody(pos, vel, 1 / 120, map, st);
      steps++;
      const b = inside(map, pos);
      if (b) { bad++; if (bad < 3) console.log(`  ${key}: inside box at`, pos.x.toFixed(2), pos.y.toFixed(2), pos.z.toFixed(2), b); }
      if (Math.abs(pos.x) > map.H || Math.abs(pos.z) > map.H) { bad++; console.log(`  ${key}: outside arena`, pos); break; }
    }
  }
  // Bots on this map
  const real = Date.now; let fake = real(); Date.now = () => fake;
  const room = new Room('T', { botFill: 6, map: key });
  room.join({ sendRaw() {} }, { name: 'h' });
  let botBad = 0;
  for (let i = 0; i < 30 * 60; i++) {
    fake += 33; room.tick();
    for (const p of room.players.values()) if (p.bot && p.alive && inside(map, p)) botBad++;
  }
  Date.now = real;
  console.log(`${key.padEnd(9)} player steps ${steps}, inside-object ${bad} | bot inside-object ticks ${botBad}`);
  failures += bad + botBad;
}
console.log(failures ? `COLLISION FAIL (${failures})` : 'COLLISION PASS');
process.exit(failures ? 1 : 0);
