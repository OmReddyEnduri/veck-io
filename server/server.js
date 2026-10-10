// VECK.IO game server: WebSocket rooms + static hosting of /public (so the Render URL is playable too).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { sanitizeRoom } = require('../public/shared.js');
const { Room, TICK_MS } = require('../public/room.js');

const PORT = process.env.PORT || 5000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_ROOM_PLAYERS = 12;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const rooms = new Map();

function findRoom(code) {
  // Public matchmaking spills over into PUBLIC-2, PUBLIC-3... when full.
  let name = code, n = 1;
  while (rooms.has(name) && rooms.get(name).isFull()) {
    if (code !== 'PUBLIC') return null;
    name = `${code}-${++n}`;
  }
  if (!rooms.has(name)) rooms.set(name, new Room(name, { maxPlayers: MAX_ROOM_PLAYERS, botFill: 0 })); // online: real players only, no bots
  return rooms.get(name);
}

function stats() {
  let players = 0;
  for (const r of rooms.values()) players += r.humanCount;
  return { ok: true, rooms: rooms.size, players, uptime: Math.round(process.uptime()) };
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health' || url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(stats()));
  }
  const file = path.normalize(path.join(PUBLIC_DIR, url === '/' ? 'index.html' : url));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// Compression off and small payload cap: lowest latency for tiny, frequent messages.
const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: 4096 });

wss.on('connection', (ws, req) => {
  if (ws._socket && ws._socket.setNoDelay) ws._socket.setNoDelay(true);
  const client = {
    ws, room: null, player: null, budget: 60, lastRefill: Date.now(),
    sendRaw(s) { if (ws.readyState === 1 && ws.bufferedAmount < 256 * 1024) ws.send(s); },
  };

  ws.on('pong', () => { ws._veckDead = false; });
  ws.on('message', (data) => {
    // Simple token bucket: ~90 messages/second sustained.
    const t = Date.now();
    client.budget = Math.min(120, client.budget + (t - client.lastRefill) * 0.09);
    client.lastRefill = t;
    if (client.budget < 1) return;
    client.budget--;

    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'join') {
      if (client.room) return;
      const room = findRoom(sanitizeRoom(msg.room));
      if (!room) { client.sendRaw(JSON.stringify({ t: 'err', m: 'Room is full' })); return ws.close(); }
      client.room = room;
      room.join(client, msg);
      return;
    }
    if (client.room) client.room.handle(client, msg);
  });
  ws.on('close', () => {
    if (client.room) {
      client.room.leave(client);
      if (client.room.isEmpty()) rooms.delete(client.room.code);
    }
  });
  ws.on('error', () => {});
});

// Game loop for all rooms.
setInterval(() => {
  for (const room of rooms.values()) {
    try { room.tick(); } catch (e) { console.error('room tick error', room.code, e); }
  }
}, TICK_MS);

// Drop dead connections.
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws._veckDead) { ws.terminate(); continue; }
    ws._veckDead = true;
    ws.ping();
  }
}, 15000);

server.listen(PORT, '0.0.0.0', () => console.log(`VECK.IO server listening on :${PORT}`));
