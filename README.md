# ⚡ VECK.IO — Multiplayer Arena FPS

A fast, Veck.io-style browser shooter: **Three.js** client on **Vercel**, authoritative **WebSocket** game server on **Render**.

## Features
- Free-for-all deathmatch: first to 30 kills or 6 minutes, then a scoreboard and map rotation
- 4 maps (Neon Metropolis, Orbital Apex (low gravity), Volcanic Core, Cyber Matrix), with jump pads, pickups and parkour crates
- 4 weapons: Pulse Rifle, Spectre SMG, Breacher Shotgun, Ion Sniper (with a scope); headshots and damage falloff
- Movement: sprint, jump (with coyote time and a jump buffer), slide, dash, air control
- Weapon animations: magazine drop and insert, bolt and pump cycling, ejected shell casings, recoil, sway and bob, a draw animation
- Server-side bots fill rooms with fewer than 4 players; there is also an offline practice mode
- Public quick play or private room codes, in-game chat, killfeed, killstreaks, minimap radar, Tab scoreboard
- Mobile touch controls (joystick, swipe to aim, action buttons)

## Low-latency netcode
- One persistent WebSocket per player with compression and Nagle disabled; the server sends snapshots 30 times a second.
- **Client-side prediction:** your own movement is simulated locally and never waits for the server.
- **Interpolation buffer:** other players are rendered slightly in the past. The buffer size adapts to network jitter, and missing packets are briefly extrapolated, so other players move smoothly.
- **Favor-the-shooter hits:** shots are checked against what you see. The server confirms each hit using recent position history and a line-of-sight check, then applies damage (health, kills and respawns are decided by the server).
- Rendering cost is kept low: instanced map geometry, no dynamic lights, pooled effects, and an adaptive resolution when FPS drops.

## Run locally
```bash
npm install
npm start            # http://localhost:5000 — the server also hosts the client
```
Tests (with the server running):
```bash
node tests/sim.test.js ws://localhost:5000   # latency + tick rate
node tests/e2e.js http://localhost:5000      # two real browsers join, shoot, take damage
```

## Deploy
- **Server (Render):** `render.yaml` blueprint, or a Node web service with build `npm install --omit=dev`, start `node server/server.js`, and health check `/health`.
- **Client (Vercel):** static deploy of `public/` (see `vercel.json`). Set the server URL in `public/config.js`, or override it per visit with `?server=wss://…`.

Free Render instances sleep after about 15 minutes idle. The menu wakes the server up as soon as the page loads, and offline practice works while it starts.

## Controls
| Key | Action |
| --- | --- |
| WASD | Move |
| Space | Jump |
| C / Ctrl | Slide (while running) |
| Shift / Q | Dash |
| Left click / Right click | Fire / Aim |
| 1–4, mouse wheel | Weapons |
| R | Reload |
| Tab | Scoreboard |
| Enter | Chat |
