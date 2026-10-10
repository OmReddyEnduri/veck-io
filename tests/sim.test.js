// Headless server check: connect bots over real WebSockets, measure round-trip latency and snapshot rate.
// Usage: node server/server.js & node tests/sim.test.js [ws://localhost:5000]
const WebSocket = require('ws');
const URL = process.argv[2] || 'ws://localhost:5000';
const N = 6;
let rtts = [], snaps = 0, welcomed = 0;
const clients = [];
for (let i = 0; i < N; i++) {
  const ws = new WebSocket(URL);
  clients.push(ws);
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'Sim' + i, room: 'SIMTEST', skin: 'CYBER' })));
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'welcome') welcomed++;
    if (m.t === 's' && i === 0) snaps++;
    if (m.t === 'P') rtts.push(Date.now() - m.c);
  });
}
setTimeout(() => {
  const iv = setInterval(() => clients.forEach((ws, i) => {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify({ t: 'u', x: Math.sin(Date.now() / 500 + i) * 10, y: 0, z: 10, yaw: 0, pitch: 0, f: 1, w: 0, sp: 1 }));
  }), 33);
  const pv = setInterval(() => clients.forEach((ws) => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'p', c: Date.now() }))), 200);
  setTimeout(() => {
    clearInterval(iv); clearInterval(pv);
    rtts.sort((a, b) => a - b);
    const p50 = rtts[Math.floor(rtts.length / 2)], p99 = rtts[Math.floor(rtts.length * 0.99)];
    console.log(`welcomed ${welcomed}/${N} | snapshots/s ${(snaps / 3).toFixed(1)} | rtt p50 ${p50}ms p99 ${p99}ms (${rtts.length} samples)`);
    clients.forEach((ws) => ws.close());
    const ok = welcomed === N && snaps / 3 > 25 && p50 < 20;
    console.log(ok ? 'SIM PASS' : 'SIM FAIL');
    process.exit(ok ? 0 : 1);
  }, 3000);
}, 500);
