# ⚡ VECK.IO — 1v1 Cyberpunk 3D Mega-Arena FPS

An arcade 1v1 Cyberpunk 3D Arena First-Person Shooter built with **Three.js**, **Web Audio API**, and vanilla JavaScript. Inspired by *Krunker.io*, *Venge.io*, *Quake Champions*, and *Valorant*.

![VECK.IO Preview](https://img.shields.io/badge/Status-Live-00f0ff?style=for-the-badge) ![Tech](https://img.shields.io/badge/Engine-Three.js_r128-ff0055?style=for-the-badge) ![Audio](https://img.shields.io/badge/Audio-Web_Audio_API-ffe600?style=for-the-badge)

---

## 🎮 Key Features

- **⚔️ 1v1 Apex Rival Boss Duel:** Face off against `NEXUS-01`, a tactical AI rival soldier equipped with a 3D Heavy Laser Cannon, running animations, and obstacle-aware line-of-sight targeting.
- **⚡ Tactical Movement & Physics:**
  - `Shift` + `C` or `Control` **Sliding Mechanics** with dynamic ground-level lowering (`1.6m`) and slide whoosh audio.
  - High-velocity **Jump Pads** for aerial repositioning.
  - Smooth AABB **Wall & Obstacle Collision Sliding System** — zero getting stuck against geometry.
- **💥 Combat Juice & Weapon Feel:**
  - **4 Unique Weapons:** Pulse Rifle (Full-Auto), Cyber Shotgun, Ion Sniper (ADS Scope), and Quantum Railgun.
  - **Weapon Skins:** `CYBER` (Cyan), `GOLD` (Dragon Gold), `VOID` (Obsidian Purple), `PLASMA` (Neon Pink).
  - **Aim Down Sights (ADS):** Right-click for zoom FOV, tight bullet spread, and precision sniper reticles.
  - **2.5x Headshot Multiplier:** Precision hits to helmet trigger golden/red `CRIT` popups and audio chimes.
  - **Visual Effects:** 3D brass shell casings ejection, procedural screen trauma/shake, neon bullet tracer beams, spark impacts.
- **✨ 3D Floating Power-Up Pickups:**
  - **Nano-Shield Overcharge** (Cyan Octahedron)
  - **Max Ammo Restock** (Gold Octahedron)
  - **Bio-Nanite Restore** (Emerald Octahedron)
  - Featuring rotating 3D geometry, neon energy halos, and a 15-second respawn cycle.
- **🗺️ Multi-Sector Mega-Arenas (260×260 units):**
  - **NEON METROPOLIS:** High-contrast neon city arena with perimeter bunkers and sniper towers.
  - **ORBITAL APEX:** Low-gravity space station with purple aurora lighting and amplified jump mechanics.
  - **VOLCANIC CORE:** High-heat magma battleground with ember point lighting.
- **📊 Tactical HUD & Scoreboard:**
  - `TAB` **Match Scoreboard** tracking Score, Kills, Deaths, Total Damage, and Accuracy %.
  - **Directional Damage Arcs:** Visual HUD indicators displaying exact incoming attack vectors.
  - **Minimap Radar:** Real-time top-down tactical tracking of player, rival, and powerup locations.
  - **Boss Health Bar:** Persistent top-center duel tracker.

---

## 🕹️ Controls

| Key | Action |
| :--- | :--- |
| `W`, `A`, `S`, `D` | Move / Strafe |
| `Shift` + `C` / `Ctrl` | Slide |
| `Space` | Jump |
| `Hold Left-Click` | Fire Weapon (Full-Auto for Rifle) |
| `Right-Click` | Aim Down Sights (ADS) / Sniper Scope |
| `1` - `4` | Select Weapon (Rifle, Shotgun, Sniper, Railgun) |
| `R` | Reload Weapon |
| `Tab` | View Match Scoreboard |

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v16+)

### Run Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/OmReddyEnduri/veck-io.git
   cd veck-io
   ```

2. Start the local server:
   ```bash
   node server.js
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:5000
   ```

---

## 🛠️ Tech Stack
- **Graphics Engine:** Three.js (r128)
- **Audio Synthesis:** Web Audio API (Synthesized procedurally without external audio assets)
- **Typography:** Google Fonts (Orbitron, Rajdhani, JetBrains Mono)
- **Backend / Static Host:** Node.js HTTP Server
- **QA Automation:** Playwright (Chromium)

---

## 📜 License
MIT License. Free to use, modify, and build upon.
