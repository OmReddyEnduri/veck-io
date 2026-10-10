// VECK.IO client — rendering, prediction, interpolation, weapons, HUD.
import * as THREE from './vendor/three.module.min.js';

const V = window.VECK;
const { PLAYER, WEAPONS, SKINS, getMap, moveBody, checkPads, rayMap, rayPlayer } = V;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const r2 = (n) => Math.round(n * 100) / 100;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IS_TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
if (IS_TOUCH) document.body.classList.add('is-touch');

// ═════════════ SETTINGS ═════════════
const settings = Object.assign({ name: '', skin: 'CYBER', room: 'PUBLIC', sens: 1, fov: 95, volume: 0.6, quality: 'auto', chStyle: 'crossdot', chColor: '#00f0ff', chSize: 1 }, loadSettings());
function loadSettings() { try { return JSON.parse(localStorage.getItem('veck_settings') || '{}'); } catch { return {}; } }
function saveSettings() { try { localStorage.setItem('veck_settings', JSON.stringify(settings)); } catch {} }

// ═════════════ AUDIO ═════════════
class Sound {
  constructor() { this.ctx = null; this.lastStep = 0; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = settings.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }
  setVolume(v) { if (this.master) this.master.gain.value = v; }
  tone(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  burst(freq, q, dur, vol, type = 'bandpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  shot(w, dist = 0) {
    const a = 1 / (1 + dist * 0.05);
    if (a < 0.03) return;
    if (w === 0) { this.burst(1800, 0.8, 0.09, 0.55 * a); this.tone('square', 180, 60, 0.07, 0.18 * a); }
    else if (w === 1) { this.burst(2600, 1, 0.06, 0.4 * a); this.tone('square', 240, 90, 0.05, 0.12 * a); }
    else if (w === 2) { this.burst(900, 0.6, 0.22, 0.8 * a, 'lowpass'); this.tone('sawtooth', 120, 40, 0.18, 0.3 * a); }
    else { this.burst(1400, 0.5, 0.35, 0.7 * a); this.tone('sawtooth', 900, 60, 0.3, 0.25 * a); }
  }
  hit(head) { head ? this.tone('triangle', 1700, 2400, 0.12, 0.35) : this.tone('sine', 1150, 1500, 0.06, 0.25); }
  kill() { this.tone('triangle', 660, 1320, 0.12, 0.35); this.tone('triangle', 990, 1980, 0.18, 0.3, 0.08); }
  hurt() { this.tone('sawtooth', 140, 50, 0.16, 0.3); }
  jump() { this.tone('sine', 300, 520, 0.08, 0.12); }
  pad() { this.tone('triangle', 200, 900, 0.3, 0.3); }
  slide() { this.burst(700, 0.4, 0.35, 0.25, 'lowpass'); }
  dash() { this.burst(1200, 0.5, 0.18, 0.3); this.tone('sine', 500, 1400, 0.12, 0.2); }
  reload() { this.tone('square', 600, 300, 0.05, 0.1); this.tone('square', 400, 800, 0.06, 0.12, 0.25); }
  empty() { this.tone('square', 900, 700, 0.03, 0.12); }
  swap() { this.tone('triangle', 500, 700, 0.05, 0.1); }
  pickup(hp) { hp ? (this.tone('sine', 400, 900, 0.15, 0.3), this.tone('sine', 800, 1400, 0.15, 0.25, 0.08)) : (this.tone('square', 300, 600, 0.08, 0.2), this.tone('square', 600, 1000, 0.1, 0.2, 0.07)); }
  step() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastStep < 0.3) return;
    this.lastStep = t; this.burst(300, 1, 0.05, 0.12, 'lowpass');
  }
  announce() { [520, 780, 1040].forEach((f, i) => this.tone('sawtooth', f, f, 0.12, 0.15, i * 0.08)); }
}
const sound = new Sound();

// ═════════════ RENDERER ═════════════
const canvas = $('game');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality === 'high', powerPreference: 'high-performance', stencil: false });
} catch (e) {
  window.__veckFail && window.__veckFail('Your browser could not start WebGL (3D graphics). Enable hardware acceleration in browser settings, or try Chrome.');
  throw e;
}
renderer.autoClear = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 400);
camera.rotation.order = 'YXZ';
const viewScene = new THREE.Scene();
const viewCam = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
viewScene.add(new THREE.HemisphereLight(0xcfe8ff, 0x202040, 2.2));
const vmSun = new THREE.DirectionalLight(0xffffff, 1.6); vmSun.position.set(1, 2, 1); viewScene.add(vmSun);

const hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 2.1);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(30, 60, 20);
scene.add(hemi, sun);

let pixelRatio = 1;
function basePixelRatio() {
  const dpr = window.devicePixelRatio || 1;
  if (settings.quality === 'low') return Math.min(dpr, 1) * 0.75;
  if (settings.quality === 'high') return Math.min(dpr, 2);
  if (settings.quality === 'medium') return Math.min(dpr, 1.25);
  return Math.min(dpr, IS_TOUCH ? 1 : 1.25);
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  viewCam.aspect = w / h;
  viewCam.updateProjectionMatrix();
  baseVFov = hfovToV(settings.fov, camera.aspect);
}
const hfovToV = (h, aspect) => THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(h) / 2) / aspect));
let baseVFov = 75;
pixelRatio = basePixelRatio();
window.addEventListener('resize', resize);
resize();

// ═════════════ TEXTURES ═════════════
function gridTexture(lineColor) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = lineColor; g.lineWidth = 3; g.globalAlpha = 0.9;
  g.strokeRect(0, 0, 128, 128);
  g.globalAlpha = 0.25; g.lineWidth = 1;
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// Procedural floor textures so every map looks different.
function floorTexture(kind, base, accent) {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  const col = (n, a = 1) => { const x = new THREE.Color(n); return `rgba(${x.r * 255 | 0},${x.g * 255 | 0},${x.b * 255 | 0},${a})`; };
  g.fillStyle = col(base); g.fillRect(0, 0, N, N);
  const speckle = (n, size, color, alpha) => { for (let i = 0; i < n; i++) { g.fillStyle = col(color, alpha * Math.random()); g.fillRect(Math.random() * N, Math.random() * N, size, size); } };
  if (kind === 'plates') {
    g.strokeStyle = col(accent, 0.35); g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, N); g.moveTo(0, i * 64); g.lineTo(N, i * 64); g.stroke(); }
    g.fillStyle = col(accent, 0.5); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillRect(i * 64 + 6, j * 64 + 6, 4, 4); g.fillRect(i * 64 + 54, j * 64 + 54, 4, 4); }
    speckle(400, 2, 0xffffff, 0.06);
  } else if (kind === 'rock') {
    speckle(3000, 3, 0x000000, 0.35);
    g.strokeStyle = col(accent, 0.8); g.lineWidth = 2; g.shadowColor = col(accent); g.shadowBlur = 8;
    for (let k = 0; k < 7; k++) { g.beginPath(); let x = Math.random() * N, y = Math.random() * N; g.moveTo(x, y); for (let i = 0; i < 6; i++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; g.lineTo(x, y); } g.stroke(); }
  } else if (kind === 'asphalt') {
    speckle(5000, 2, 0x000000, 0.3); speckle(1500, 2, 0xffffff, 0.08);
    g.fillStyle = 'rgba(255,220,80,0.55)'; for (let i = 0; i < 4; i++) g.fillRect(124, i * 64 + 8, 8, 40);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3; g.strokeRect(2, 2, N - 4, N - 4);
  } else if (kind === 'snow') {
    speckle(4000, 3, 0xffffff, 0.5); speckle(800, 2, 0x8aa4c0, 0.25);
    g.strokeStyle = 'rgba(120,140,170,0.25)'; g.lineWidth = 6; for (const x of [70, 90, 170, 190]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 10, N); g.stroke(); }
  } else if (kind === 'grass') {
    for (let i = 0; i < 6000; i++) { const t = Math.random(); g.fillStyle = `rgba(${40 + t * 60 | 0},${110 + t * 90 | 0},${40 + t * 40 | 0},0.6)`; g.fillRect(Math.random() * N, Math.random() * N, 2, 3 + Math.random() * 3); }
    g.fillStyle = 'rgba(255,240,120,0.6)'; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * N, Math.random() * N, 3, 3);
  } else if (kind === 'sand') {
    speckle(5000, 2, 0x8a6a3a, 0.35); speckle(2000, 2, 0xfff0d0, 0.3);
    g.strokeStyle = 'rgba(150,110,60,0.25)'; g.lineWidth = 3;
    for (let y = 10; y < N; y += 22) { g.beginPath(); for (let x = 0; x <= N; x += 8) g.lineTo(x, y + Math.sin((x / N) * Math.PI * 2) * 6); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,240,200,0.9)'); grd.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const GLOW = glowTexture();
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// ═════════════ WORLD ═════════════
let map = null;
const world = new THREE.Group();
scene.add(world);
const padMeshes = [], pickupMeshes = [];
let minimapBase = null;

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map && m.map !== GLOW) m.map.dispose(); if (m.emissiveMap) m.emissiveMap.dispose(); m.dispose(); });
  });
  g.clear();
}

function buildWorld(key) {
  map = getMap(key);
  disposeGroup(world);
  padMeshes.length = 0; pickupMeshes.length = 0;
  scene.background = new THREE.Color(map.sky);
  scene.fog = new THREE.Fog(map.fog, map.fogNear, map.fogFar);
  hemi.color.setHex(map.ambient); hemi.groundColor.setHex(map.ground);
  sun.color.setHex(map.sun);

  // Floor: neon grid on cyber maps, a themed texture elsewhere
  const H = map.H;
  let floorMat;
  if (map.floor === 'grid' || !map.floor) {
    const gtex = gridTexture(hex(map.grid));
    gtex.repeat.set(H / 2, H / 2);
    floorMat = new THREE.MeshLambertMaterial({ color: map.ground, emissive: map.grid, emissiveMap: gtex, emissiveIntensity: 0.55 });
  } else {
    const ftex = floorTexture(map.floor, map.ground, map.grid);
    ftex.repeat.set(H / 6, H / 6);
    floorMat = new THREE.MeshLambertMaterial({ map: ftex });
    if (map.floor === 'rock') { floorMat.emissive = new THREE.Color(map.grid); floorMat.emissiveMap = ftex; floorMat.emissiveIntensity = 0.35; }
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(H * 2 + 4, H * 2 + 4), floorMat);
  floor.rotation.x = -Math.PI / 2;
  world.add(floor);

  // All boxes in one instanced draw call
  const boxes = map.boxes;
  const boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), boxes.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  boxes.forEach((b, i) => {
    m4.makeScale(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
    m4.setPosition((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
    boxMesh.setMatrixAt(i, m4);
    boxMesh.setColorAt(i, col.setHex(map.palette[b.c] ?? map.palette[0]));
  });
  boxMesh.instanceMatrix.needsUpdate = true;
  if (boxMesh.instanceColor) boxMesh.instanceColor.needsUpdate = true;
  world.add(boxMesh);

  // Neon edges for every box in one LineSegments draw call
  const pos = new Float32Array(boxes.length * 24 * 3);
  let k = 0;
  const push = (x, y, z) => { pos[k++] = x; pos[k++] = y; pos[k++] = z; };
  for (const b of boxes) {
    const xs = [b.minX, b.maxX], ys = [b.minY + 0.01, b.maxY], zs = [b.minZ, b.maxZ];
    for (const y of ys) for (const z of zs) { push(xs[0], y, z); push(xs[1], y, z); }
    for (const y of ys) for (const x of xs) { push(x, y, zs[0]); push(x, y, zs[1]); }
    for (const x of xs) for (const z of zs) { push(x, ys[0], z); push(x, ys[1], z); }
  }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  world.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: map.edge, transparent: true, opacity: map.edges === false ? 0.22 : 0.75 })));

  buildDeco(m4);

  // Jump pads
  const padGeo = new THREE.CylinderGeometry(1.35, 1.45, 0.14, 24);
  const ringGeo = new THREE.TorusGeometry(1.1, 0.07, 6, 28);
  const padMat = new THREE.MeshBasicMaterial({ color: map.edge });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  for (const p of map.pads) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(padGeo, padMat); base.position.y = 0.07; g.add(base);
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring);
    g.position.set(p.x, 0, p.z);
    g.ring = ring;
    world.add(g); padMeshes.push(g);
  }

  // Pickups
  const pkGeo = new THREE.OctahedronGeometry(0.42);
  const pkMats = { hp: new THREE.MeshBasicMaterial({ color: 0x00ff88 }), ammo: new THREE.MeshBasicMaterial({ color: 0xffd000 }) };
  const baseGeo = new THREE.CylinderGeometry(0.6, 0.7, 0.08, 16);
  const baseMat = new THREE.MeshBasicMaterial({ color: 0x223355 });
  map.pickups.forEach((pk, i) => {
    const g = new THREE.Group();
    const gem = new THREE.Mesh(pkGeo, pkMats[pk.type]);
    gem.position.y = 1;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: pk.type === 'hp' ? 0x00ff88 : 0xffd000, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(1.8, 1.8, 1); halo.position.y = 1;
    g.add(gem, halo, new THREE.Mesh(baseGeo, baseMat));
    g.position.set(pk.x, pk.y + 0.04, pk.z);
    g.gem = gem; g.halo = halo; g.type = pk.type; g.on = true; g.idx = i;
    world.add(g); pickupMeshes.push(g);
  });

  // Stars (skipped on phones / low quality to save GPU)
  if (!(IS_TOUCH || settings.quality === 'low') && map.edges !== false) {
  const starPos = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) {
    const u = Math.random() * Math.PI * 2, v = Math.random() * 0.45 + 0.05, r = 300;
    starPos[i * 3] = Math.cos(u) * Math.cos(v * Math.PI) * r;
    starPos[i * 3 + 1] = Math.abs(Math.sin(v * Math.PI)) * r * 0.6 + 40;
    starPos[i * 3 + 2] = Math.sin(u) * Math.cos(v * Math.PI) * r;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  world.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, fog: false, sizeAttenuation: false, transparent: true, opacity: 0.7 })));
  }

  buildMinimapBase();
  $('mapName').textContent = '◈ ' + map.name;
  renderer.compile(scene, camera);
}

// Per-map scenery outside / around the arena (all cheap: instanced or a handful of meshes).
const decoAnim = [];
function buildDeco(m4) {
  const H = map.H;
  decoAnim.length = 0;
  hemi.intensity = map.edges === false ? 2.6 : 2.1;
  sun.intensity = map.edges === false ? 2.2 : 1.4;
  const ring = (n, fn) => { for (let i = 0; i < n; i++) fn(i, (i / n) * Math.PI * 2); };
  if (map.deco === 'skyline' || map.deco === 'rain') {
    const n = map.deco === 'skyline' ? 80 : 50;
    const sky = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(map.sky).multiplyScalar(1.8) }), n);
    ring(n, (i, a) => { const d = H + 25 + (i * 37 % 50), w = 8 + (i * 13 % 14), h = 25 + (i * 29 % 80); m4.makeScale(w, h, w); m4.setPosition(Math.cos(a) * d, h / 2, Math.sin(a) * d); sky.setMatrixAt(i, m4); });
    world.add(sky);
    // Neon window strips on the skyline
    const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: map.edge }), n);
    ring(n, (i, a) => { const d = H + 24 + (i * 37 % 50), h = 25 + (i * 29 % 80); m4.makeScale(6, 0.4, 6); m4.setPosition(Math.cos(a) * (d - 0.5), h * (0.4 + (i % 5) * 0.1), Math.sin(a) * (d - 0.5)); lights.setMatrixAt(i, m4); });
    world.add(lights);
  }
  if (map.deco === 'rain') {
    const n = IS_TOUCH ? 400 : 1200, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() * 2 - 1) * H; pos[i * 3 + 1] = Math.random() * 40; pos[i * 3 + 2] = (Math.random() * 2 - 1) * H; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: map.grid, size: 0.12, transparent: true, opacity: 0.7 }));
    world.add(pts);
    decoAnim.push((dt) => { for (let i = 1; i < pos.length; i += 3) { pos[i] -= dt * 30; if (pos[i] < 0) pos[i] += 40; } g.attributes.position.needsUpdate = true; });
  }
  if (map.deco === 'snow') {
    const n = IS_TOUCH ? 500 : 1500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() * 2 - 1) * H; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = (Math.random() * 2 - 1) * H; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    world.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.9 })));
    decoAnim.push((dt, t) => { for (let i = 0; i < pos.length; i += 3) { pos[i + 1] -= dt * 2.5; pos[i] += Math.sin(t + i) * dt * 0.6; if (pos[i + 1] < 0) pos[i + 1] += 30; } g.attributes.position.needsUpdate = true; });
    // Snowy mountains around the yard
    const mnt = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), new THREE.MeshLambertMaterial({ color: 0xe8f0f8 }), 24);
    ring(24, (i, a) => { const d = H + 50 + (i * 23 % 40), s = 35 + (i * 17 % 30); m4.makeScale(s, s * 0.9, s); m4.setPosition(Math.cos(a) * d, s * 0.45, Math.sin(a) * d); mnt.setMatrixAt(i, m4); });
    world.add(mnt);
  }
  if (map.deco === 'clouds') {
    const cl = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9ab, emissiveIntensity: 0.5 }), 36);
    ring(36, (i, a) => { const d = H + 30 + (i * 31 % 60), s = 10 + (i * 7 % 12); m4.makeScale(s * 1.8, s * 0.7, s); m4.setPosition(Math.cos(a) * d, 12 + (i * 11 % 30), Math.sin(a) * d); cl.setMatrixAt(i, m4); });
    world.add(cl);
    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(12, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff2b0, fog: false }));
    sunMesh.position.set(-150, 120, -200); world.add(sunMesh);
  }
  if (map.deco === 'dunes') {
    const du = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: map.ground }), 30);
    ring(30, (i, a) => { const d = H + 30 + (i * 29 % 50), s = 30 + (i * 13 % 30); m4.makeScale(s * 1.6, s * 0.35, s); m4.setPosition(Math.cos(a) * d, 0, Math.sin(a) * d); du.setMatrixAt(i, m4); });
    world.add(du);
    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false }));
    sunMesh.position.set(160, 70, -180); world.add(sunMesh);
  }
  if (map.deco === 'lava') {
    // Glowing lava pools and rivers around the arena edge + rising embers.
    const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a10 });
    const lava = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), lavaMat, 20);
    ring(20, (i, a) => { const d = H + 12 + (i * 17 % 30), s = 10 + (i * 7 % 14); m4.makeRotationX(-Math.PI / 2); m4.scale(new THREE.Vector3(s, s, 1)); m4.setPosition(Math.cos(a) * d, 0.05, Math.sin(a) * d); lava.setMatrixAt(i, m4); });
    world.add(lava);
    const volc = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshLambertMaterial({ color: 0x2a0e08 }), 10);
    ring(10, (i, a) => { const d = H + 60 + (i * 19 % 40), s = 40 + (i * 13 % 30); m4.makeScale(s, s, s); m4.setPosition(Math.cos(a + 0.3) * d, s / 2, Math.sin(a + 0.3) * d); volc.setMatrixAt(i, m4); });
    world.add(volc);
    const n = 300, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() * 2 - 1) * H; pos[i * 3 + 1] = Math.random() * 25; pos[i * 3 + 2] = (Math.random() * 2 - 1) * H; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    world.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xff7a20, size: 0.2, map: GLOW, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    decoAnim.push((dt, t) => { for (let i = 1; i < pos.length; i += 3) { pos[i] += dt * 2; if (pos[i] > 25) pos[i] = 0; } g.attributes.position.needsUpdate = true; lavaMat.color.setHSL(0.05, 1, 0.5 + Math.sin(t * 2) * 0.05); });
  }
  if (map.deco === 'squid') {
    // Painted sky mural: white clouds on the inside of the walls.
    const cl = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }), 48);
    for (let i = 0; i < 48; i++) {
      const side = i % 4, k = Math.floor(i / 4), along = -H + 8 + k * ((2 * H - 16) / 11), y = 8 + (i * 7 % 10), r = 2.5 + (i * 3 % 4);
      const rot = [0, Math.PI, -Math.PI / 2, Math.PI / 2][side];
      m4.makeRotationY(rot); m4.scale(new THREE.Vector3(r * 1.8, r, 1));
      const p = [[along, y, -H + 0.05], [along, y, H - 0.05], [H - 0.05, y, along], [-H + 0.05, y, along]][side];
      m4.setPosition(p[0], p[1], p[2]); cl.setMatrixAt(i, m4);
    }
    world.add(cl);
    // The giant doll ("red light, green light"): head turns around every few seconds.
    const doll = new THREE.Group();
    const dress = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.6, 4.5, 16), new THREE.MeshLambertMaterial({ color: 0xff8a1f }));
    dress.position.y = 4.25;
    const shirt = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 2, 16), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
    shirt.position.y = 7.4;
    const legM = new THREE.MeshLambertMaterial({ color: 0xffe0c8 });
    for (const x of [-0.7, 0.7]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.2, 8), legM); l.position.set(x, 1.1, 0); doll.add(l); }
    for (const x of [-1.5, 1.5]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.6, 8), legM); a.position.set(x, 6.6, 0); a.rotation.z = x > 0 ? 0.25 : -0.25; doll.add(a); }
    const head = new THREE.Group(); head.position.y = 9.4;
    const face = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 16), legM); head.add(face);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(1.45, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: 0x1a1210 }));
    hair.rotation.x = 0.5; head.add(hair);
    for (const x of [-1.3, 1.3]) { const tail = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), hair.material); tail.position.set(x, -0.3, 0.6); tail.scale.set(1, 1.5, 1); head.add(tail); }
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const x of [-0.45, 0.45]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), eyeM); e.position.set(x, 0.1, -1.25); head.add(e); }
    const cheekM = new THREE.MeshBasicMaterial({ color: 0xff8aa0 });
    for (const x of [-0.75, 0.75]) { const c = new THREE.Mesh(new THREE.CircleGeometry(0.22, 10), cheekM); c.position.set(x, -0.3, -1.22); c.rotation.y = Math.PI; head.add(c); }
    doll.add(dress, shirt, head);
    doll.position.set(0, 2, -H + 7);
    world.add(doll);
    // Pink guards with circle / triangle / square masks
    const guardM = new THREE.MeshLambertMaterial({ color: 0xe0386e }), maskM = new THREE.MeshBasicMaterial({ color: 0x111111 }), symM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const syms = [new THREE.RingGeometry(0.12, 0.17, 16), new THREE.RingGeometry(0.12, 0.17, 3), new THREE.RingGeometry(0.12, 0.17, 4, 1, Math.PI / 4)];
    [[-8, -H + 6], [8, -H + 6], [-H + 4, 0], [H - 4, 0]].forEach(([x, z], i) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.5), guardM); body.position.y = 0.95;
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), guardM); hd.position.y = 1.95;
      const mask = new THREE.Mesh(new THREE.CircleGeometry(0.27, 16), maskM); mask.position.set(0, 1.95, 0.29);
      const sym = new THREE.Mesh(syms[i % 3], symM); sym.position.set(0, 1.95, 0.3);
      g.add(body, hd, mask, sym);
      g.position.set(x, 0, z); g.lookAt(0, 0, 0);
      world.add(g);
    });
    // Animation: head faces the wall ("green light"), then snaps around to face the arena ("red light").
    decoAnim.push((dt, t) => {
      const cycle = t % 9;
      const target = cycle < 5 ? 0 : Math.PI;
      head.rotation.y += (target - head.rotation.y) * Math.min(1, dt * (target === Math.PI ? 10 : 3));
    });
  }
  if (map.deco === 'planet') {
    const planet = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 24), new THREE.MeshLambertMaterial({ color: 0x6a4cc0, emissive: 0x2a1060 }));
    planet.position.set(-220, 90, -260); world.add(planet);
    const ringM = new THREE.Mesh(new THREE.RingGeometry(90, 120, 48), new THREE.MeshBasicMaterial({ color: 0xc8a0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.35, fog: false }));
    ringM.position.copy(planet.position); ringM.rotation.set(1.2, 0.3, 0); world.add(ringM);
    planet.material.fog = false;
    decoAnim.push((dt) => { planet.rotation.y += dt * 0.02; });
  }
}

function buildMinimapBase() {
  const c = document.createElement('canvas'); c.width = c.height = 140;
  const g = c.getContext('2d');
  const s = 140 / (map.H * 2);
  g.fillStyle = 'rgba(6,10,26,0.9)'; g.fillRect(0, 0, 140, 140);
  for (const b of map.boxes) {
    if (b.c === 3) continue;
    const t = clamp((b.maxY) / 8, 0.25, 1);
    g.fillStyle = `rgba(120,170,255,${0.25 + t * 0.45})`;
    g.fillRect((b.minX + map.H) * s, (b.minZ + map.H) * s, (b.maxX - b.minX) * s, (b.maxZ - b.minZ) * s);
  }
  g.fillStyle = hex(map.edge);
  for (const p of map.pads) { g.beginPath(); g.arc((p.x + map.H) * s, (p.z + map.H) * s, 2.5, 0, 7); g.fill(); }
  minimapBase = c;
}

// ═════════════ AVATARS (other players) ═════════════
const AV = {
  leg: new THREE.BoxGeometry(0.22, 0.9, 0.26),
  torso: new THREE.BoxGeometry(0.66, 0.72, 0.38),
  belt: new THREE.BoxGeometry(0.68, 0.1, 0.4),
  head: new THREE.BoxGeometry(0.42, 0.4, 0.42),
  visor: new THREE.BoxGeometry(0.36, 0.11, 0.06),
  arm: new THREE.BoxGeometry(0.16, 0.62, 0.18),
  gun: new THREE.BoxGeometry(0.1, 0.14, 0.75),
  core: new THREE.BoxGeometry(0.22, 0.16, 0.04),
  pack: new THREE.BoxGeometry(0.44, 0.5, 0.16),
  shadow: new THREE.CircleGeometry(0.55, 16),
};
const avArmor = new THREE.MeshLambertMaterial({ color: 0x2a3150 });
const avDark = new THREE.MeshLambertMaterial({ color: 0x141828 });
const avShadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
const accentCache = {};
const accentMat = (skin) => accentCache[skin] || (accentCache[skin] = new THREE.MeshBasicMaterial({ color: (SKINS[skin] || SKINS.CYBER).color }));

class Avatar {
  constructor(info) {
    this.id = info.id; this.name = info.name; this.skin = info.skin; this.bot = info.bot;
    this.kills = info.kills || 0; this.deaths = info.deaths || 0; this.ping = 0;
    this.hp = 100; this.alive = info.alive !== false; this.flags = 0; this.w = 0;
    this.buf = [];
    this.pos = new THREE.Vector3(); this.yaw = 0; this.pitch = 0;
    this.walk = 0; this.lastFired = 0; this.slideT = 0;
    const acc = accentMat(this.skin);
    const g = this.mesh = new THREE.Group();
    const legL = this.legL = new THREE.Group(), legR = this.legR = new THREE.Group();
    const mkLeg = (grp, x) => { const m = new THREE.Mesh(AV.leg, avDark); m.position.y = -0.45; grp.add(m); grp.position.set(x, 0.92, 0); g.add(grp); };
    mkLeg(legL, -0.17); mkLeg(legR, 0.17);
    const upper = this.upper = new THREE.Group(); upper.position.y = 0.92; g.add(upper);
    const torso = new THREE.Mesh(AV.torso, avArmor); torso.position.y = 0.4; upper.add(torso);
    const belt = new THREE.Mesh(AV.belt, acc); belt.position.y = 0.06; upper.add(belt);
    const core = new THREE.Mesh(AV.core, acc); core.position.set(0, 0.5, -0.2); upper.add(core);
    const pack = new THREE.Mesh(AV.pack, avDark); pack.position.set(0, 0.42, 0.26); upper.add(pack);
    const head = this.head = new THREE.Group(); head.position.y = 0.78; upper.add(head);
    const skull = new THREE.Mesh(AV.head, avArmor); skull.position.y = 0.2; head.add(skull);
    const visor = new THREE.Mesh(AV.visor, acc); visor.position.set(0, 0.22, -0.21); head.add(visor);
    const armR = this.armR = new THREE.Group(); armR.position.set(0.41, 0.68, 0); upper.add(armR);
    const ar = new THREE.Mesh(AV.arm, avArmor); ar.position.set(0, -0.22, -0.12); ar.rotation.x = 1.1; armR.add(ar);
    const gun = new THREE.Mesh(AV.gun, avDark); gun.position.set(-0.05, -0.28, -0.5); armR.add(gun);
    const gunAcc = new THREE.Mesh(AV.core, acc); gunAcc.scale.set(0.4, 0.5, 6); gunAcc.position.set(-0.05, -0.2, -0.5); armR.add(gunAcc);
    this.muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffcc66, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.muzzle.scale.set(0.7, 0.7, 1); this.muzzle.position.set(-0.05, -0.28, -0.95); this.muzzle.visible = false; armR.add(this.muzzle);
    const armL = this.armL = new THREE.Group(); armL.position.set(-0.41, 0.68, 0); upper.add(armL);
    const al = new THREE.Mesh(AV.arm, avArmor); al.position.set(0.1, -0.22, -0.18); al.rotation.set(1.2, 0, -0.5); armL.add(al);
    const shadow = new THREE.Mesh(AV.shadow, avShadow); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; g.add(shadow);
    // Nametag
    this.tagCanvas = document.createElement('canvas'); this.tagCanvas.width = 256; this.tagCanvas.height = 64;
    this.tagTex = new THREE.CanvasTexture(this.tagCanvas); this.tagTex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTex, transparent: true, depthWrite: false }));
    this.tag.scale.set(1.9, 0.475, 1); this.tag.position.y = 2.35; g.add(this.tag);
    this.tagHp = -1; this.drawTag();
    g.visible = this.alive;
    scene.add(g);
  }
  drawTag() {
    const hpB = Math.ceil(this.hp / 5) * 5;
    if (hpB === this.tagHp) return;
    this.tagHp = hpB;
    const c = this.tagCanvas.getContext('2d');
    c.clearRect(0, 0, 256, 64);
    c.font = '800 24px Rajdhani, sans-serif'; c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillText(this.name, 129, 28);
    c.fillStyle = '#fff'; c.fillText(this.name, 128, 26);
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(48, 38, 160, 9);
    c.fillStyle = this.hp > 50 ? '#00ff88' : this.hp > 25 ? '#ffe600' : '#ff0055';
    c.fillRect(49, 39, 158 * clamp(this.hp / 100, 0, 1), 7);
    this.tagTex.needsUpdate = true;
  }
  push(T, x, y, z, yaw, pitch, flags) {
    const b = this.buf;
    if (b.length && T <= b[b.length - 1].T) return;
    b.push({ T, x, y, z, yaw, pitch, flags });
    if (b.length > 40) b.shift();
  }
  teleport(x, y, z, yaw) {
    this.buf.length = 0;
    this.pos.set(x, y, z); this.yaw = yaw;
    this.mesh.position.copy(this.pos);
  }
  sample(rt) {
    const b = this.buf;
    if (!b.length) return;
    let i = b.length - 1;
    while (i > 0 && b[i].T > rt) i--;
    const a = b[i];
    let s;
    if (rt <= a.T || i === b.length - 1) {
      // Hold, or extrapolate briefly from the last two samples to hide a late packet.
      s = a;
      if (i > 0 && rt > a.T) {
        const p = b[i - 1], dt = Math.min(rt - a.T, 120) / (a.T - p.T || 33);
        this.pos.set(a.x + (a.x - p.x) * dt, a.y + Math.max(0, (a.y - p.y) * dt), a.z + (a.z - p.z) * dt);
      } else this.pos.set(a.x, a.y, a.z);
      this.yaw = a.yaw; this.pitch = a.pitch;
    } else {
      const c = b[i + 1];
      const t = (rt - a.T) / (c.T - a.T);
      this.pos.set(lerp(a.x, c.x, t), lerp(a.y, c.y, t), lerp(a.z, c.z, t));
      let dy = c.yaw - a.yaw;
      if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw = a.yaw + dy * t;
      this.pitch = lerp(a.pitch, c.pitch, t);
      s = t < 0.5 ? a : c;
    }
    this.flags = s.flags;
    while (b.length > 3 && b[1].T < rt - 500) b.shift();
  }
  update(rt, dt, now) {
    this.sample(rt);
    const g = this.mesh;
    const dead = (this.flags & 16) !== 0 || !this.alive;
    g.visible = !dead && !((this.flags & 32) && Math.floor(now / 90) % 2 === 0);
    if (dead) return;
    const moved = Math.hypot(this.pos.x - g.position.x, this.pos.z - g.position.z) / Math.max(dt, 1e-3);
    g.position.copy(this.pos);
    g.rotation.y = this.yaw;
    const sliding = (this.flags & 2) !== 0, air = (this.flags & 4) !== 0;
    this.slideT = lerp(this.slideT, sliding ? 1 : 0, Math.min(1, dt * 12));
    if (moved > 0.5 && !air) this.walk += dt * Math.min(moved, 14) * 1.1;
    const sw = air ? 0.5 : Math.sin(this.walk) * Math.min(1, moved / 6) * 0.8;
    this.legL.rotation.x = air ? -0.6 : sw;
    this.legR.rotation.x = air ? 0.3 : -sw;
    this.upper.position.y = 0.92 - this.slideT * 0.45;
    this.legL.position.y = this.legR.position.y = 0.92 - this.slideT * 0.45;
    this.legL.rotation.x -= this.slideT * 1.2; this.legR.rotation.x -= this.slideT * 1.2;
    this.upper.rotation.x = this.slideT * 0.35;
    this.armR.rotation.x = this.pitch * 0.9;
    this.armL.rotation.x = this.pitch * 0.9;
    this.head.rotation.x = this.pitch * 0.6;
    this.armL.rotation.z = -Math.sin(this.walk) * 0.08;
    if (this.muzzle.visible && now - this.lastFired > 50) this.muzzle.visible = false;
    const d = camera.position.distanceTo(g.position);
    this.tag.visible = d < 70;
    this.drawTag();
  }
  flash(now) { this.lastFired = now; this.muzzle.visible = true; this.muzzle.material.rotation = Math.random() * 6; }
  dispose() { scene.remove(this.mesh); this.tagTex.dispose(); this.tag.material.dispose(); this.muzzle.material.dispose(); }
}

// ═════════════ EFFECTS ═════════════
const tracerGeo = new THREE.BoxGeometry(1, 1, 1); tracerGeo.translate(0, 0, -0.5);
const tracers = [];
for (let i = 0; i < 48; i++) {
  const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.visible = false; m.life = 0; m.frustumCulled = false; scene.add(m); tracers.push(m);
}
let tracerIdx = 0;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
function spawnTracer(from, to, color, width = 0.035) {
  const len = from.distanceTo(to);
  if (len < 0.5) return;
  const m = tracers[tracerIdx++ % tracers.length];
  m.position.copy(from); m.lookAt(to);
  m.scale.set(width, width, len);
  m.material.color.setHex(color); m.material.opacity = 0.9;
  m.life = 0.09; m.maxLife = 0.09; m.visible = true;
}
const P_MAX = IS_TOUCH ? 250 : 500;
const pPos = new Float32Array(P_MAX * 3), pCol = new Float32Array(P_MAX * 3);
const pVel = new Float32Array(P_MAX * 3), pLife = new Float32Array(P_MAX);
for (let i = 0; i < P_MAX; i++) pPos[i * 3 + 1] = -999;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: GLOW }));
particles.frustumCulled = false;
scene.add(particles);
let pIdx = 0, pActive = 0;
const _c = new THREE.Color();
function burst(p, color, n, speed = 6, up = 2) {
  _c.setHex(color);
  for (let k = 0; k < n; k++) {
    const i = pIdx++ % P_MAX;
    pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
    pVel[i * 3] = (Math.random() - 0.5) * speed; pVel[i * 3 + 1] = Math.random() * speed * 0.6 + up; pVel[i * 3 + 2] = (Math.random() - 0.5) * speed;
    pCol[i * 3] = _c.r; pCol[i * 3 + 1] = _c.g; pCol[i * 3 + 2] = _c.b;
    pLife[i] = 0.35 + Math.random() * 0.35;
  }
  pActive = 1.0;
}
function updateEffects(dt) {
  for (const m of tracers) {
    if (!m.visible) continue;
    m.life -= dt;
    if (m.life <= 0) { m.visible = false; continue; }
    m.material.opacity = (m.life / m.maxLife) * 0.9;
  }
  if (pActive > 0) {
    pActive -= dt;
    const g = map ? map.gravity : 20;
    for (let i = 0; i < P_MAX; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      if (pLife[i] <= 0) { pPos[i * 3 + 1] = -999; continue; }
      pVel[i * 3 + 1] -= g * 0.6 * dt;
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      if (pPos[i * 3 + 1] < 0.02) { pPos[i * 3 + 1] = 0.02; pVel[i * 3 + 1] *= -0.3; }
      pActive = Math.max(pActive, pLife[i]);
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }
}

// ═════════════ VIEWMODEL ═════════════
const vm = new THREE.Group();
vm.scale.setScalar(0.82);
viewScene.add(vm);
const vmGuns = [];
const shells = [];
let vmMuzzle, shellIdx = 0;
function ejectShell(g) {
  const m = shells[shellIdx++ % shells.length];
  if (!m) return;
  m.material = g.shellMat;
  m.position.set(g.position.x + 0.05, g.position.y + 0.04, g.position.z - 0.05);
  m.vel.set(0.9 + Math.random() * 0.5, 1.1 + Math.random() * 0.5, 0.2 + Math.random() * 0.3);
  m.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
  m.life = 0.55; m.visible = true;
}
function updateShells(dt) {
  for (const m of shells) {
    if (!m.visible) continue;
    m.life -= dt;
    if (m.life <= 0) { m.visible = false; continue; }
    m.vel.y -= 6 * dt;
    m.position.addScaledVector(m.vel, dt);
    m.rotation.x += m.spin.x * dt; m.rotation.y += m.spin.y * dt; m.rotation.z += m.spin.z * dt;
  }
}
function buildViewmodels(skin) {
  vm.clear(); vmGuns.length = 0;
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1f33 });
  const mid = new THREE.MeshLambertMaterial({ color: 0x3a4466 });
  const acc = new THREE.MeshBasicMaterial({ color: (SKINS[skin] || SKINS.CYBER).color });
  const glove = new THREE.MeshLambertMaterial({ color: 0x0e1018 });
  const box = (g, mat, w, h, d, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
  const brass = new THREE.MeshLambertMaterial({ color: 0xd4a017, emissive: 0x3a2a00 });
  const shellRed = new THREE.MeshLambertMaterial({ color: 0xcc2233, emissive: 0x220000 });
  // Each spec builds the gun and returns its muzzle z, the magazine mesh (animated on reload) and an optional bolt.
  const specs = [
    (g) => { box(g, dark, 0.08, 0.11, 0.5, 0, 0, -0.1); box(g, mid, 0.04, 0.04, 0.34, 0, 0.015, -0.5); box(g, mid, 0.07, 0.1, 0.18, 0, -0.02, 0.24); box(g, acc, 0.084, 0.018, 0.36, 0, 0.035, -0.12); box(g, dark, 0.03, 0.05, 0.12, 0, 0.08, -0.05);
      const mag = box(g, dark, 0.055, 0.17, 0.08, 0, -0.13, -0.06, 0.25); box(mag, acc, 0.057, 0.02, 0.082, 0, -0.06, 0); const bolt = box(g, mid, 0.02, 0.03, 0.07, 0.045, 0.03, 0.02); return { mz: -0.68, mag, bolt, shell: brass }; },
    (g) => { box(g, dark, 0.075, 0.1, 0.36, 0, 0, -0.06); box(g, mid, 0.035, 0.035, 0.18, 0, 0.01, -0.32); box(g, acc, 0.078, 0.018, 0.26, 0, 0.03, -0.06); box(g, mid, 0.05, 0.06, 0.14, 0, -0.01, 0.17);
      const mag = box(g, dark, 0.05, 0.22, 0.06, 0, -0.15, -0.1, 0.1); box(mag, acc, 0.052, 0.02, 0.062, 0, -0.08, 0); const bolt = box(g, mid, 0.02, 0.025, 0.06, 0.04, 0.025, 0.0); return { mz: -0.42, mag, bolt, shell: brass }; },
    (g) => { box(g, dark, 0.1, 0.12, 0.55, 0, 0, -0.1); box(g, mid, 0.045, 0.045, 0.45, -0.025, 0.035, -0.5); box(g, mid, 0.045, 0.045, 0.45, 0.025, 0.035, -0.5); box(g, acc, 0.104, 0.02, 0.3, 0, -0.04, -0.25); box(g, dark, 0.08, 0.12, 0.22, 0, -0.03, 0.25);
      const pump = box(g, mid, 0.09, 0.07, 0.16, 0, -0.06, -0.42); const mag = box(g, shellRed, 0.035, 0.035, 0.08, 0, -0.08, -0.05); box(mag, brass, 0.037, 0.037, 0.02, 0, 0, 0.04); return { mz: -0.74, mag, pump, shell: shellRed }; },
    (g) => { box(g, dark, 0.08, 0.11, 0.62, 0, 0, -0.08); box(g, mid, 0.035, 0.035, 0.6, 0, 0.015, -0.68); box(g, dark, 0.06, 0.06, 0.26, 0, 0.1, -0.08); box(g, acc, 0.065, 0.065, 0.03, 0, 0.1, -0.22); box(g, acc, 0.084, 0.018, 0.4, 0, -0.035, -0.12); box(g, mid, 0.07, 0.12, 0.22, 0, -0.03, 0.3);
      const mag = box(g, dark, 0.05, 0.1, 0.09, 0, -0.1, 0.02); const bolt = box(g, mid, 0.07, 0.02, 0.02, 0.06, 0.04, 0.08); box(bolt, acc, 0.025, 0.025, 0.025, 0.04, 0, 0); return { mz: -0.99, mag, bolt, shell: brass }; },
  ];
  specs.forEach((fn) => {
    const g = new THREE.Group();
    const info = fn(g);
    box(g, glove, 0.09, 0.09, 0.12, 0.0, -0.09, 0.08);
    g.hand = box(g, glove, 0.08, 0.08, 0.1, -0.02, -0.06, -0.3);
    g.handBase = g.hand.position.clone();
    g.muzzleZ = info.mz; g.mag = info.mag; g.bolt = info.bolt; g.pump = info.pump; g.shellMat = info.shell;
    g.magBase = info.mag.position.clone(); g.magRot = info.mag.rotation.x;
    if (info.bolt) g.boltBase = info.bolt.position.clone();
    if (info.pump) g.pumpBase = info.pump.position.clone();
    g.visible = false;
    vm.add(g); vmGuns.push(g);
  });
  // Ejected shell casings (pooled)
  shells.length = 0;
  const shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.035, 6);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(shellGeo, brass); m.visible = false; m.life = 0; m.vel = new THREE.Vector3(); m.spin = new THREE.Vector3();
    vm.add(m); shells.push(m);
  }
  vmMuzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffd080, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  vmMuzzle.scale.set(0.35, 0.35, 1); vmMuzzle.visible = false; vm.add(vmMuzzle);
}

// ═════════════ NETWORK ═════════════
function serverUrl() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  const sameOrigin = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname) || location.hostname.endsWith('.onrender.com');
  if (sameOrigin && location.protocol.startsWith('http')) return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  return (window.VECK_CONFIG && window.VECK_CONFIG.server) || 'ws://localhost:5000';
}
const httpFromWs = (u) => u.replace(/^ws/, 'http');

class Net {
  constructor() { this.ws = null; this.room = null; this.offline = false; this.timer = null; }
  online(url, join) {
    return new Promise((resolve, reject) => {
      const ws = this.ws = new WebSocket(url);
      let opened = false;
      const to = setTimeout(() => { if (!opened) { ws.close(); reject(new Error('timeout')); } }, 70000);
      ws.onopen = () => { opened = true; clearTimeout(to); ws.send(JSON.stringify(join)); resolve(); };
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMessage(m); };
      ws.onerror = () => { if (!opened) { clearTimeout(to); reject(new Error('connect failed')); } };
      ws.onclose = () => { if (opened) onDisconnect(); };
    });
  }
  local(join) {
    this.offline = true;
    const room = this.room = new V.Room('OFFLINE', { botFill: 6, map: join.map });
    this.client = { sendRaw: (s) => queueMicrotask(() => onMessage(JSON.parse(s))) };
    room.join(this.client, join);
    this.timer = setInterval(() => room.tick(), V.TICK_MS);
    return Promise.resolve();
  }
  send(m) {
    if (this.offline) { if (this.room) queueMicrotask(() => this.room && this.room.handle(this.client, m)); return; }
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  }
  close() {
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
    if (this.timer) clearInterval(this.timer);
    this.room = null; this.timer = null; this.offline = false;
  }
}
const net = new Net();

// Clock sync + adaptive interpolation delay.
const clock = { offset: 0, samples: [], rtt: 0, interp: 100, lastSnapAt: 0, jitter: 0, tick: 33 };
const serverNow = () => performance.now() + clock.offset;
function onPong(m) {
  const t = performance.now();
  const rtt = t - m.c;
  clock.samples.push({ rtt, off: m.T - (m.c + rtt / 2) });
  if (clock.samples.length > 10) clock.samples.shift();
  const best = clock.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
  clock.offset = best.off;
  clock.rtt = clock.rtt ? lerp(clock.rtt, rtt, 0.3) : rtt;
}

// ═════════════ GAME STATE ═════════════
const me = {
  id: 0, name: '', skin: 'CYBER', alive: false, hp: 100, sp: 0,
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), phys: { onGround: true, wasGround: true },
  yaw: 0, pitch: 0, recoil: 0, recoilYaw: 0,
  sliding: false, slideT: 0, slideCd: 0, crouch: 0, dashCd: 0, jumpBuf: 0, coyote: 0,
  w: 0, ammo: WEAPONS.map((w) => w.mag), reserve: WEAPONS.map((w) => w.reserve),
  reloadUntil: 0, switchUntil: 0, lastShot: 0, shotSeq: 0, ads: 0, firing: false, wantAds: false, adsToggle: false,
  kills: 0, deaths: 0, streak: 0, killedBy: '', deadAt: 0,
};
const avatars = new Map();
let playing = false, matchState = 'play', matchEndsAt = 0, killGoal = 30, roomName = '';
let camShake = 0, lastStateSent = 0, lastPing = 0, lastPickupTry = 0;
let paused = false, chatOpen = false;

function onMessage(m) {
  switch (m.t) {
    case 'welcome': {
      me.id = m.id; roomName = m.room;
      clock.offset = m.T - performance.now(); clock.samples.length = 0; clock.tick = m.tick || 33;
      killGoal = m.goal; matchState = m.state; matchEndsAt = performance.now() + m.ends;
      for (const a of avatars.values()) a.dispose();
      avatars.clear();
      for (const p of m.players) if (p.id !== me.id) avatars.set(p.id, new Avatar(p));
      else { me.kills = p.kills; me.deaths = p.deaths; }
      buildWorld(m.map);
      m.pickups.forEach((on, i) => setPickup(i, on));
      $('roomTxt').textContent = net.offline ? 'OFFLINE PRACTICE' : 'ROOM ' + m.room;
      $('sbRoom').textContent = net.offline ? 'OFFLINE' : m.room;
      for (const d of [0, 150, 300]) setTimeout(sendPing, d);
      startPlaying();
      break;
    }
    case 's': onSnapshot(m); break;
    case 'P': onPong(m); break;
    case 'join':
      if (m.p.id !== me.id && !avatars.has(m.p.id)) { avatars.set(m.p.id, new Avatar(m.p)); feedSys(`${esc(m.p.name)} joined`); }
      break;
    case 'leave': {
      const a = avatars.get(m.id);
      if (a) { feedSys(`${esc(a.name)} left`); a.dispose(); avatars.delete(m.id); }
      break;
    }
    case 'spawn': {
      if (m.id === me.id) {
        me.pos.set(m.x, m.y, m.z); me.vel.set(0, 0, 0); me.yaw = m.yaw; me.pitch = 0; me.sp = m.sp;
        me.alive = true; me.hp = 100; me.sliding = false; me.dashCd = 0;
        me.ammo = WEAPONS.map((w) => w.mag); me.reserve = WEAPONS.map((w) => w.reserve); me.reloadUntil = 0;
        $('deathScreen').classList.add('hidden');
        // Spawn-in: quick flash + weapon draw animation
        me.switchUntil = performance.now() + 420;
        const fl = $('vignette');
        fl.animate([{ opacity: 1, background: 'radial-gradient(circle, rgba(0,240,255,0.0), rgba(0,240,255,0.55))' }, { opacity: 0 }], { duration: 600, easing: 'ease-out' });
        if (playing) sound.tone('sine', 300, 900, 0.25, 0.2);
      } else {
        const a = avatars.get(m.id);
        if (a) { a.alive = true; a.hp = 100; a.flags = 0; a.teleport(m.x, m.y, m.z, m.yaw); }
      }
      break;
    }
    case 'f': {
      const a = avatars.get(m.id);
      const now = performance.now();
      _v1.set(m.o[0], m.o[1], m.o[2]); _v2.set(m.e[0], m.e[1], m.e[2]);
      if (a) {
        a.flash(now);
        // Start the tracer at their gun, not their eyes.
        a.muzzle.getWorldPosition(_v3);
        if (_v3.distanceTo(_v1) < 3) _v1.copy(_v3);
      }
      spawnTracer(_v1, _v2, WEAPONS[m.w] ? WEAPONS[m.w].color : 0xffffff, 0.03);
      burst(_v2, 0xffaa55, 3, 3, 1);
      sound.shot(m.w, _v1.distanceTo(camera.position));
      break;
    }
    case 'd': onDamage(m); break;
    case 'k': onKill(m); break;
    case 'pk': {
      setPickup(m.i, m.on);
      if (m.by === me.id) {
        const type = map.pickups[m.i].type;
        if (type === 'hp') { me.hp = m.hp; showPickup('+50 HEALTH', '#00ff88'); }
        else {
          me.reserve = WEAPONS.map((w) => w.reserve); showPickup('AMMO REFILLED', '#ffd000');
          $('weapon').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)', boxShadow: '0 0 30px #ffd000' }, { transform: 'scale(1)' }], { duration: 450, easing: 'ease-out' });
          vmKick = 0.8; // little gun 'check' flourish
        }
        sound.pickup(type === 'hp');
      }
      break;
    }
    case 'start': {
      matchState = 'play'; matchEndsAt = performance.now() + m.ends;
      buildWorld(m.map);
      for (const p of m.players) {
        if (p.id === me.id) { me.kills = 0; me.deaths = 0; me.streak = 0; continue; }
        const a = avatars.get(p.id) || (avatars.set(p.id, new Avatar(p)), avatars.get(p.id));
        a.kills = 0; a.deaths = 0;
      }
      $('endScreen').classList.add('hidden');
      banner('MATCH START', map.name);
      sound.announce();
      break;
    }
    case 'end': showEnd(m); break;
    case 'c': {
      const name = m.id === me.id ? me.name : (avatars.get(m.id) || {}).name || '?';
      chatLine(`<b style="color:${m.id === me.id ? '#00f0ff' : '#ffe600'}">${esc(name)}:</b> ${esc(m.m)}`);
      break;
    }
    case 'err': showMenu(m.m); break;
  }
}

function onSnapshot(m) {
  const t = performance.now();
  if (clock.lastSnapAt) {
    const gap = t - clock.lastSnapAt;
    clock.jitter = lerp(clock.jitter, Math.abs(gap - clock.tick), 0.1);
  }
  clock.lastSnapAt = t;
  clock.interp = clamp(clock.tick * 1.5 + clock.jitter * 2.5, 45, 200);
  for (const e of m.p) {
    const [id, x, y, z, yaw, pitch, flags, w, hp, ping] = e;
    if (id === me.id) {
      if (me.alive && !(flags & 16)) me.hp = hp;
      me.ping = ping;
      continue;
    }
    let a = avatars.get(id);
    if (!a) { a = new Avatar({ id, name: '…', skin: 'CYBER' }); avatars.set(id, a); }
    a.push(m.T, x, y, z, yaw, pitch, flags);
    a.w = w; a.hp = hp; a.ping = ping;
  }
}

function onDamage(m) {
  if (m.v === me.id) {
    me.hp = m.hp;
    sound.hurt();
    camShake = Math.min(1, camShake + m.n / 40);
    const vg = $('vignette'); vg.style.opacity = clamp(m.n / 30, 0.35, 1);
    clearTimeout(onDamage.vt); onDamage.vt = setTimeout(() => (vg.style.opacity = 0), 220);
    // Direction indicator relative to view.
    const ang = Math.atan2(m.ax - me.pos.x, m.az - me.pos.z);
    const rel = ang - Math.atan2(-Math.sin(me.yaw), -Math.cos(me.yaw));
    const dd = $('dmgDir'); dd.style.transform = `rotate(${-rel}rad)`; dd.style.transition = 'none'; dd.style.opacity = 1;
    requestAnimationFrame(() => { dd.style.transition = 'opacity .9s'; dd.style.opacity = 0; });
  }
  if (m.a === me.id && m.v !== me.id) {
    const a = avatars.get(m.v);
    if (a) { a.hp = m.hp; dmgNumber(a.pos, m.n, m.hs); }
  }
}

const STREAKS = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'MULTI KILL', 5: 'RAMPAGE', 7: 'UNSTOPPABLE', 10: 'GODLIKE' };
function onKill(m) {
  const killer = m.a === me.id ? me.name : (avatars.get(m.a) || {}).name || '?';
  const victim = m.v === me.id ? me.name : (avatars.get(m.v) || {}).name || '?';
  const ka = avatars.get(m.a), va = avatars.get(m.v);
  if (ka) ka.kills++;
  if (va) { va.deaths++; va.alive = false; burst(_v1.copy(va.pos).setY(va.pos.y + 1), (SKINS[va.skin] || SKINS.CYBER).color, 40, 8, 3); va.mesh.visible = false; }
  if (m.a === me.id && m.v !== me.id) {
    me.kills++; me.streak = m.st;
    sound.kill();
    hitmarker('kill');
    banner(STREAKS[m.st] || (m.hs ? 'HEADSHOT' : 'ELIMINATED'), victim.toUpperCase());
  }
  if (m.v === me.id) {
    me.deaths++; me.alive = false; me.streak = 0; me.deadAt = performance.now();
    me.killedBy = m.a === me.id ? 'yourself' : killer;
    me.firing = false; me.wantAds = false;
    $('deathBy').innerHTML = m.a === me.id ? 'Self-eliminated' : `Eliminated by <b style="color:#ffe600">${esc(killer)}</b> · ${WEAPONS[m.w] ? WEAPONS[m.w].short : ''}${m.hs ? ' · HEADSHOT' : ''}`;
    $('deathScreen').classList.remove('hidden');
  }
  const mine = m.a === me.id || m.v === me.id;
  feed(`<span style="color:${m.a === me.id ? '#00f0ff' : '#fff'}">${esc(killer)}</span><span class="w">[${WEAPONS[m.w] ? WEAPONS[m.w].short : '?'}]</span><span style="color:${m.v === me.id ? '#00f0ff' : '#ff4d7d'}">${esc(victim)}</span>${m.hs ? '<span class="hs">◎</span>' : ''}`, mine);
}

function setPickup(i, on) {
  const g = pickupMeshes[i];
  if (g) { g.on = !!on; g.gem.visible = g.halo.visible = !!on; }
}

// ═════════════ INPUT ═════════════
const keys = {};
const joy = { x: 0, y: 0 };
window.addEventListener('keydown', (e) => {
  if (!playing) return;
  if (chatOpen) {
    if (e.code === 'Enter') { sendChat(); e.preventDefault(); }
    else if (e.code === 'Escape') closeChat();
    return;
  }
  if (e.code === 'Tab') { e.preventDefault(); $('scoreboard').classList.remove('hidden'); renderScoreboard(); return; }
  if (e.code === 'Enter' || e.code === 'KeyT') { e.preventDefault(); openChat(); return; }
  keys[e.code] = true;
  if (e.code === 'Space') { me.jumpBuf = 0.15; e.preventDefault(); }
  if (e.code === 'KeyR') reload();
  if (e.code === 'KeyQ' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') dash();
  if (e.code === 'KeyC' || e.code === 'ControlLeft') { trySlide(); if (e.code === 'ControlLeft') e.preventDefault(); }
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (n >= 0 && n < WEAPONS.length) switchWeapon(n); }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Tab') $('scoreboard').classList.add('hidden');
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; me.firing = false; });

const locked = () => document.pointerLockElement === canvas;
document.addEventListener('mousedown', (e) => { if (playing && !IS_TOUCH && !locked() && !chatOpen && $('pauseScreen').classList.contains('hidden') && e.target === canvas) lockPointer(); });
// Plain pointer lock (no unadjustedMovement: some systems reject it). Must run inside a click/key handler.
function lockPointer() {
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => needClick()); } catch { needClick(); }
}
// Lock failed or was lost: show the overlay so one click brings the mouse back.
function needClick() {
  if (!playing || IS_TOUCH || locked() || chatOpen) return;
  paused = true; me.firing = false; me.wantAds = false;
  $('pauseScreen').classList.remove('hidden');
}
document.addEventListener('pointerlockerror', needClick);
document.addEventListener('pointerlockchange', () => {
  if (!playing || IS_TOUCH) return;
  if (locked()) { paused = false; $('pauseScreen').classList.add('hidden'); }
  else needClick();
});
document.addEventListener('mousemove', (e) => {
  if (!locked()) return;
  const adsScale = me.ads > 0 ? lerp(1, curVFov() / baseVFov, 0.9) : 1;
  const s = 0.0022 * settings.sens * adsScale;
  const mx = clamp(e.movementX, -400, 400), my = clamp(e.movementY, -400, 400); // ignore browser spike glitches
  me.yaw -= mx * s;
  me.pitch = clamp(me.pitch - my * s, -1.55, 1.55);
  vmSway.x += e.movementX * 0.00012; vmSway.y += e.movementY * 0.00012;
});
document.addEventListener('mousedown', (e) => {
  if (!locked()) return;
  if (e.button === 0) { me.firing = true; fire(); }
  if (e.button === 2) me.wantAds = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) me.firing = false;
  if (e.button === 2) me.wantAds = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', (e) => { if (locked()) switchWeapon((me.w + (e.deltaY > 0 ? 1 : -1) + WEAPONS.length) % WEAPONS.length); }, { passive: true });

// Touch controls
function setupTouch() {
  const joyEl = $('joy'), knob = $('joyKnob');
  let joyId = null, cx = 0, cy = 0;
  const aimIds = new Map();
  const tSens = () => 0.0055 * settings.sens;
  joyEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0]; joyId = t.identifier;
    const r = joyEl.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    moveJoy(t);
  }, { passive: false });
  const moveJoy = (t) => {
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const d = Math.hypot(dx, dy), max = 50;
    if (d > max) { dx *= max / d; dy *= max / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joy.x = dx / max; joy.y = dy / max;
  };
  const aimStart = (e) => { for (const t of e.changedTouches) aimIds.set(t.identifier, { x: t.clientX, y: t.clientY }); };
  document.addEventListener('touchmove', (e) => {
    if (!playing) return;
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) moveJoy(t);
      const a = aimIds.get(t.identifier);
      if (a) {
        me.yaw -= (t.clientX - a.x) * tSens();
        me.pitch = clamp(me.pitch - (t.clientY - a.y) * tSens(), -1.55, 1.55);
        vmSway.x += (t.clientX - a.x) * 0.0002;
        a.x = t.clientX; a.y = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) { joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; }
      aimIds.delete(t.identifier);
    }
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
  $('aimZone').addEventListener('touchstart', (e) => { e.preventDefault(); aimStart(e); }, { passive: false });
  const btn = (id, down, up, aims) => {
    const el = $(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); el.classList.add('down'); sound.init(); if (aims) aimStart(e); down(); }, { passive: false });
    const u = (e) => { e.preventDefault(); el.classList.remove('down'); if (up) up(); };
    el.addEventListener('touchend', u, { passive: false });
    el.addEventListener('touchcancel', u, { passive: false });
  };
  btn('tFire', () => { me.firing = true; fire(); }, () => (me.firing = false), true);
  btn('tFire2', () => { me.firing = true; fire(); }, () => (me.firing = false));
  btn('tJump', () => { me.jumpBuf = 0.15; keys.Space = true; }, () => (keys.Space = false));
  btn('tAds', () => { me.adsToggle = !me.adsToggle; });
  btn('tSlide', () => { keys.KeyC = true; trySlide(); }, () => (keys.KeyC = false));
  btn('tReload', reload);
  btn('tDash', dash);
  btn('tSwap', () => switchWeapon((me.w + 1) % WEAPONS.length));
  btn('tMenu', () => { paused = true; $('pauseScreen').classList.remove('hidden'); });
  btn('tBoard', () => { const sb = $('scoreboard'); sb.classList.toggle('hidden'); renderScoreboard(); });
}
if (IS_TOUCH) setupTouch();

// ═════════════ CHAT ═════════════
function openChat() {
  chatOpen = true;
  for (const k in keys) keys[k] = false;
  me.firing = false;
  const ci = $('chatInput'); ci.classList.remove('hidden'); ci.value = ''; ci.focus();
}
function closeChat() {
  chatOpen = false;
  const ci = $('chatInput'); ci.blur(); ci.classList.add('hidden');
  if (!IS_TOUCH && !locked() && playing) lockPointer();
}
function sendChat() {
  const v = $('chatInput').value.trim();
  if (v) net.send({ t: 'c', m: v });
  closeChat();
}
function chatLine(html) {
  const c = $('chat');
  const d = document.createElement('div'); d.className = 'line'; d.innerHTML = html;
  c.appendChild(d);
  while (c.children.length > 6) c.firstChild.remove();
  setTimeout(() => d.remove(), 9000);
}

// ═════════════ WEAPONS ═════════════
const curWeapon = () => WEAPONS[me.w];
function switchWeapon(n) {
  if (n === me.w || !me.alive) return;
  me.w = n; me.switchUntil = performance.now() + 280; me.reloadUntil = 0; me.ads = Math.min(me.ads, 0.3);
  sound.swap();
  net.send({ t: 'w', w: n });
  updateWeaponHud(true);
}
function reload() {
  const wp = curWeapon();
  if (!me.alive || me.reloadUntil || me.ammo[me.w] >= wp.mag || me.reserve[me.w] <= 0) return;
  me.reloadUntil = performance.now() + wp.reload;
  sound.reload();
  setTimeout(() => me.reloadUntil && sound.tone('square', 300, 200, 0.06, 0.12), wp.reload * 0.3);
  setTimeout(() => me.reloadUntil && sound.tone('square', 500, 900, 0.05, 0.15), wp.reload * 0.75);
}
function finishReload() {
  const wp = curWeapon();
  const need = wp.mag - me.ammo[me.w];
  const take = Math.min(need, me.reserve[me.w]);
  me.ammo[me.w] += take; me.reserve[me.w] -= take; me.reloadUntil = 0;
}

const _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(), _origin = new THREE.Vector3(), _end = new THREE.Vector3(), _muz = new THREE.Vector3();
function fire() {
  const now = performance.now();
  if (!me.alive || paused || chatOpen || matchState !== 'play') return;
  const wp = curWeapon();
  if (now < me.switchUntil || me.reloadUntil || now - me.lastShot < wp.rate) return;
  if (me.ammo[me.w] <= 0) { sound.empty(); reload(); me.lastShot = now; return; }
  me.ammo[me.w]--;
  me.lastShot = now;
  const seq = ++me.shotSeq;
  sound.shot(me.w);

  camera.updateMatrixWorld();
  _origin.copy(camera.position);
  camera.getWorldDirection(_dir);
  _right.setFromMatrixColumn(camera.matrixWorld, 0);
  _up.setFromMatrixColumn(camera.matrixWorld, 1);

  const hspeed = Math.hypot(me.vel.x, me.vel.z);
  let spread = lerp(wp.spread, wp.adsSpread, me.ads);
  if (wp.pellets === 1) spread += (hspeed / PLAYER.run) * 0.012 * (1 - me.ads * 0.7) + (me.phys.onGround ? 0 : 0.025);
  const hits = [];
  let firstEnd = null;
  for (let p = 0; p < wp.pellets; p++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    const d = _v1.copy(_dir).addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    let tBest = rayMap(map, _origin.x, _origin.y, _origin.z, d.x, d.y, d.z, 300);
    let hitAv = null, head = false;
    for (const av of avatars.values()) {
      if (!av.mesh.visible || (av.flags & 16)) continue;
      const res = rayPlayer(_origin.x, _origin.y, _origin.z, d.x, d.y, d.z, av.pos.x, av.pos.y, av.pos.z, tBest, (av.flags & 2) !== 0);
      if (res && res.t < tBest) { tBest = res.t; hitAv = av; head = res.head; }
    }
    _end.copy(_origin).addScaledVector(d, tBest);
    if (!firstEnd) firstEnd = _end.clone();
    if (hitAv) {
      hits.push({ id: hitAv.id, hs: head ? 1 : 0, pt: [r2(_end.x), r2(_end.y), r2(_end.z)] });
      burst(_end, (SKINS[hitAv.skin] || SKINS.CYBER).color, head ? 10 : 5, 4, 1);
    } else if (tBest < 300) {
      burst(_end, 0xffcc66, wp.pellets > 1 ? 2 : 5, 4, 1.5);
    }
    // Tracer from the viewmodel muzzle.
    vmMuzzleWorld(_muz);
    if (p < 4 || Math.random() < 0.3) spawnTracer(_muz, _end, wp.color, wp.pellets > 1 ? 0.02 : 0.035);
  }
  net.send({ t: 'f', s: seq, w: me.w, o: [r2(_origin.x), r2(_origin.y), r2(_origin.z)], e: [r2(firstEnd.x), r2(firstEnd.y), r2(firstEnd.z)] });
  for (const h of hits) net.send({ t: 'h', s: seq, id: h.id, hs: h.hs, pt: h.pt });
  if (hits.length) { const anyHead = hits.some((h) => h.hs); hitmarker(anyHead ? 'head' : ''); sound.hit(anyHead); }

  // Recoil + feedback
  const k = 1 - me.ads * 0.45;
  me.recoil += wp.recoil * k * (0.8 + Math.random() * 0.4);
  me.recoilYaw += (Math.random() - 0.5) * wp.recoil * 0.6 * k;
  vmKick = Math.min(1, vmKick + (wp.pellets > 1 || wp.scope ? 1 : 0.45));
  camShake = Math.min(0.6, camShake + wp.recoil * 2);
  vmMuzzle.visible = true; vmMuzzle.material.rotation = Math.random() * 6; vmMuzzleAt = now;
  const gun = vmGuns[me.w];
  if (gun) { if (wp.pellets > 1 || wp.scope) setTimeout(() => ejectShell(gun), 260); else ejectShell(gun); }
  ammoBump();
  if (me.ammo[me.w] === 0) setTimeout(reload, 120);
}

// ═════════════ MOVEMENT ═════════════
function trySlide() {
  if (!me.alive || me.sliding || me.slideCd > 0 || !me.phys.onGround) return;
  const hs = Math.hypot(me.vel.x, me.vel.z);
  if (hs < 5) return;
  me.sliding = true; me.slideT = PLAYER.slideTime;
  const boost = Math.max(hs, PLAYER.slideBoost) / hs;
  me.vel.x *= boost; me.vel.z *= boost;
  sound.slide();
}
function dash() {
  if (!me.alive || me.dashCd > 0 || paused) return;
  const { wx, wz } = wishDir();
  let dx = wx, dz = wz;
  if (!dx && !dz) { dx = -Math.sin(me.yaw); dz = -Math.cos(me.yaw); }
  me.vel.x = dx * PLAYER.dashSpeed; me.vel.z = dz * PLAYER.dashSpeed;
  me.vel.y = Math.max(me.vel.y, 2.5);
  me.dashCd = PLAYER.dashCooldown;
  camShake = Math.min(0.5, camShake + 0.25);
  sound.dash();
}
function wishDir() {
  let f = 0, s = 0;
  if (!chatOpen) {
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) s += 1;
    if (keys.KeyA || keys.ArrowLeft) s -= 1;
  }
  f -= joy.y; s += joy.x;
  const len = Math.hypot(f, s);
  if (len > 1) { f /= len; s /= len; }
  const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
  return { wx: -sy * f + cy * s, wz: -cy * f - sy * s, mag: Math.min(1, len) };
}
function updateMovement(dt) {
  const wp = curWeapon();
  const { wx, wz, mag } = wishDir();
  const ground = me.phys.onGround;
  me.coyote = ground ? 0.1 : Math.max(0, me.coyote - dt);
  me.jumpBuf = Math.max(0, me.jumpBuf - dt);
  me.dashCd = Math.max(0, me.dashCd - dt);
  me.slideCd = Math.max(0, me.slideCd - dt);
  const crouching = !!(keys.KeyC || keys.ControlLeft);

  if (me.sliding) {
    me.slideT -= dt;
    const decay = Math.exp(-1.4 * dt);
    me.vel.x *= decay; me.vel.z *= decay;
    me.vel.x += wx * 6 * dt; me.vel.z += wz * 6 * dt;
    if (me.slideT <= 0 || !crouching || Math.hypot(me.vel.x, me.vel.z) < 4) { me.sliding = false; me.slideCd = 0.35; }
  } else {
    const speed = PLAYER.run * wp.speed * (1 - me.ads * 0.35) * (crouching && ground ? 0.55 : 1);
    const tx = wx * speed, tz = wz * speed;
    if (ground) {
      const k = 1 - Math.exp(-(mag > 0 ? 14 : 10) * dt);
      me.vel.x += (tx - me.vel.x) * k; me.vel.z += (tz - me.vel.z) * k;
    } else if (mag > 0) {
      // Air control: steer toward wish without bleeding momentum gained from pads/dash.
      const cur = Math.hypot(me.vel.x, me.vel.z);
      const k = 1 - Math.exp(-3 * dt);
      me.vel.x += (tx - me.vel.x) * k; me.vel.z += (tz - me.vel.z) * k;
      const nl = Math.hypot(me.vel.x, me.vel.z);
      if (cur > speed && nl < cur) { me.vel.x *= cur / nl; me.vel.z *= cur / nl; }
    }
  }
  if (me.jumpBuf > 0 && (ground || me.coyote > 0)) {
    me.vel.y = map.jump; me.jumpBuf = 0; me.coyote = 0;
    if (me.sliding) { me.sliding = false; me.slideCd = 0.3; }
    sound.jump();
  }
  me.vel.y -= map.gravity * dt;
  if (checkPads(me.pos, me.vel, map)) { sound.pad(); me.sliding = false; camShake = Math.min(0.5, camShake + 0.2); }
  moveBody(me.pos, me.vel, dt, map, me.phys);
  if (me.phys.onGround && Math.hypot(me.vel.x, me.vel.z) > 3 && !me.sliding) sound.step();
  me.crouch = lerp(me.crouch, me.sliding ? 1 : crouching ? 0.6 : 0, 1 - Math.exp(-14 * dt));

  // Pickups (server validates)
  const now = performance.now();
  if (now - lastPickupTry > 250) {
    for (const g of pickupMeshes) {
      if (!g.on) continue;
      const dx = me.pos.x - g.position.x, dz = me.pos.z - g.position.z;
      if (dx * dx + dz * dz < 2.4 && Math.abs(me.pos.y - g.position.y) < 1.6) {
        if (g.type === 'hp' && me.hp >= 100) continue;
        net.send({ t: 'pk', i: g.idx }); lastPickupTry = now;
      }
    }
  }
}

// ═════════════ CAMERA & VIEWMODEL ═════════════
let vmKick = 0, vmMuzzleAt = 0, bobT = 0;
const vmSway = { x: 0, y: 0 };
const curVFov = () => { const wp = curWeapon(); return lerp(baseVFov, Math.min(baseVFov, wp.adsFov), me.ads); };
function vmMuzzleWorld(out) {
  // Project the viewmodel muzzle into the world: same screen point, 0.6m in front of the camera.
  const g = vmGuns[me.w];
  out.set(g ? g.position.x : 0.2, g ? g.position.y : -0.2, g ? g.position.z + g.muzzleZ : -0.8).multiplyScalar(vm.scale.x).project(viewCam);
  out.z = 0.5; out.unproject(camera);
  _v3.copy(out).sub(camera.position).normalize();
  return out.copy(camera.position).addScaledVector(_v3, 0.6);
}
function updateCamera(dt, now) {
  const wp = curWeapon();
  const wantAds = (me.wantAds || me.adsToggle) && me.alive && !me.reloadUntil && now >= me.switchUntil && !me.sliding;
  me.ads = clamp(me.ads + (wantAds ? 1 : -1) * dt * (wp.scope ? 5 : 7), 0, 1);
  // Recoil recovery
  me.recoil *= Math.exp(-9 * dt); me.recoilYaw *= Math.exp(-9 * dt);
  camShake *= Math.exp(-6 * dt);
  const shake = camShake * 0.02;
  if (me.alive) {
    camera.position.set(me.pos.x, me.pos.y + PLAYER.eye - me.crouch * 0.55, me.pos.z);
    camera.rotation.set(clamp(me.pitch + me.recoil, -1.56, 1.56) + (Math.random() - 0.5) * shake, me.yaw + me.recoilYaw + (Math.random() - 0.5) * shake, 0);
  } else {
    // Death cam: drift up and look down at where we died.
    const t = Math.min(1, (now - me.deadAt) / 1200);
    camera.position.set(me.pos.x, me.pos.y + PLAYER.eye + t * 3, me.pos.z);
    camera.rotation.set(lerp(me.pitch, -1.1, t), me.yaw, Math.sin(t * 2) * 0.1);
  }
  const fov = curVFov();
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

  // Viewmodel
  const scoped = wp.scope && me.ads > 0.92;
  $('scope').style.opacity = scoped ? 1 : 0;
  const chOp = scoped || !me.alive ? '0' : '1';
  if (hudCache.chOp !== chOp) { hudCache.chOp = chOp; $('crosshair').style.opacity = chOp; }
  const firingNow = now - me.lastShot < 90;
  if (hudCache.chFire !== firingNow) { hudCache.chFire = firingNow; $('crosshair').classList.toggle('firing', firingNow); }
  vmGuns.forEach((g, i) => (g.visible = i === me.w && me.alive && !scoped));
  const g = vmGuns[me.w];
  if (!g) return;
  const hs = Math.hypot(me.vel.x, me.vel.z);
  if (me.phys.onGround && !me.sliding) bobT += dt * hs * 0.9;
  const bob = me.phys.onGround ? Math.min(1, hs / PLAYER.run) * (1 - me.ads * 0.85) : 0;
  vmSway.x *= Math.exp(-10 * dt); vmSway.y *= Math.exp(-10 * dt);
  vmKick *= Math.exp(-14 * dt);
  // Draw animation: gun swings up from below with an ease-out.
  const sw = now < me.switchUntil ? (me.switchUntil - now) / 280 : 0;
  const switching = sw * sw;
  // Reload phases 0..1: tilt in -> mag out -> new mag in -> slap/charge -> tilt back.
  const rp = me.reloadUntil ? clamp(1 - (me.reloadUntil - now) / wp.reload, 0, 1) : 0;
  const ease = (x) => x * x * (3 - 2 * x);
  const tilt = me.reloadUntil ? ease(clamp(rp / 0.15, 0, 1)) * (1 - ease(clamp((rp - 0.85) / 0.15, 0, 1))) : 0;
  const hipX = 0.26, hipY = -0.25, hipZ = -0.5;
  const sinceShot = now - me.lastShot;
  g.position.set(
    lerp(hipX, 0, me.ads) + Math.sin(bobT) * 0.012 * bob - clamp(vmSway.x, -0.04, 0.04) - tilt * 0.04,
    lerp(hipY, -0.152 - (me.w === 3 ? 0.055 : 0), me.ads) + Math.abs(Math.cos(bobT)) * 0.012 * bob + clamp(vmSway.y, -0.04, 0.04) - switching * 0.3 - tilt * 0.05 - me.crouch * 0.02 + (me.phys.onGround ? 0 : 0.015) + Math.sin(now / 900) * 0.002 * (1 - me.ads),
    lerp(hipZ, -0.36, me.ads) + vmKick * 0.06 + tilt * 0.06
  );
  g.rotation.set(vmKick * 0.12 + tilt * 0.35 - switching * 0.9, tilt * 0.35, (me.sliding ? 0.25 : 0) + tilt * 0.5 + switching * 0.4);
  // Magazine: drop out, new one rises in, slap.
  if (g.mag) {
    let dy = 0, vis = true, rx = 0;
    if (me.reloadUntil) {
      if (rp > 0.15 && rp < 0.45) { const k = (rp - 0.15) / 0.3; dy = -k * k * 0.5; rx = k * 0.6; if (k > 0.85) vis = false; }
      else if (rp >= 0.45 && rp < 0.75) { const k = ease((rp - 0.45) / 0.3); dy = -(1 - k) * 0.22; }
      else if (rp >= 0.75 && rp < 0.85) { dy = Math.sin((rp - 0.75) / 0.1 * Math.PI) * 0.015; }
    }
    g.mag.position.set(g.magBase.x, g.magBase.y + dy, g.magBase.z);
    g.mag.rotation.x = g.magRot + rx;
    g.mag.visible = vis;
    // Support hand follows the magazine during reload.
    if (g.hand) {
      const follow = me.reloadUntil && rp > 0.3 && rp < 0.85 ? ease(Math.sin((rp - 0.3) / 0.55 * Math.PI)) : 0;
      g.hand.position.set(lerp(g.handBase.x, g.magBase.x - 0.02, follow), lerp(g.handBase.y, g.magBase.y + dy - 0.1, follow), lerp(g.handBase.z, g.magBase.z, follow));
    }
  }
  // Bolt / pump cycling after a shot and at the end of reload.
  const cycle = (t) => (t > 0 && t < 1 ? Math.sin(t * Math.PI) : 0);
  const shotCycle = cycle(sinceShot / Math.min(wp.rate * 0.8, 450));
  const reloadCycle = me.reloadUntil ? cycle((rp - 0.82) / 0.13) : 0;
  if (g.bolt) g.bolt.position.z = g.boltBase.z + Math.max(shotCycle * (wp.scope ? 1 : 0.4), reloadCycle) * 0.06;
  if (g.pump) g.pump.position.z = g.pumpBase.z + Math.max(sinceShot > 120 ? cycle((sinceShot - 120) / 380) : 0, reloadCycle) * 0.09;
  updateShells(dt);
  if (vmMuzzle.visible) {
    vmMuzzle.position.set(g.position.x, g.position.y + 0.015, g.position.z + g.muzzleZ);
    if (now - vmMuzzleAt > 40) vmMuzzle.visible = false;
  }
}

// ═════════════ HUD ═════════════
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function setHtml(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).innerHTML = v; } }
function updateWeaponHud(force) {
  const wp = curWeapon();
  setText('wName', wp.name);
  setHtml('ammo', `${me.ammo[me.w]} <small>/ ${me.reserve[me.w]}</small>`);
  $('ammo').classList.toggle('low', me.ammo[me.w] <= Math.ceil(wp.mag * 0.25));
  setText('reloadTxt', me.reloadUntil ? 'RELOADING…' : me.ammo[me.w] === 0 ? (me.reserve[me.w] ? 'PRESS R' : 'NO AMMO') : '');
  const slots = WEAPONS.map((w, i) => `<div class="${i === me.w ? 'on' : ''}" data-w="${i}">${i + 1} ${w.short}</div>`).join('');
  setHtml('slots', slots);
}
$('slots').addEventListener('click', (e) => { const w = e.target.dataset && e.target.dataset.w; if (w !== undefined) switchWeapon(+w); });
function updateHud(now) {
  const hp = Math.max(0, Math.ceil(me.hp));
  setText('hpNum', String(hp));
  const hb = $('hpBar');
  const sc = (hp / 100).toFixed(3);
  if (hudCache.hpScale !== sc) { hudCache.hpScale = sc; hb.style.transform = `scaleX(${sc})`; hb.classList.toggle('low', hp <= 30); }
  const dsc = (1 - me.dashCd / PLAYER.dashCooldown).toFixed(2);
  if (hudCache.dash !== dsc) { hudCache.dash = dsc; $('dashBar').style.transform = `scaleX(${dsc})`; }
  setText('dashTxt', me.dashCd > 0 ? me.dashCd.toFixed(1) + 's' : 'READY');
  updateWeaponHud();
  // Timer / scores
  const left = Math.max(0, matchEndsAt - now) / 1000;
  setText('timer', matchState === 'play' ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : '--:--');
  let lead = me.kills, rank = 1;
  for (const a of avatars.values()) { if (a.kills > lead) lead = a.kills; if (a.kills > me.kills) rank++; }
  setText('lead', `LEAD ${lead}/${killGoal}`);
  setText('myScore', `#${rank} · ${me.kills} K`);
  if (!me.alive) {
    const t = Math.max(0, PLAYER.respawnTime - (now - me.deadAt)) / 1000;
    setText('deathTimer', t > 0 ? `Respawning in ${t.toFixed(1)}s` : 'Respawning…');
  }
  // Dynamic crosshair spread
  const wp = curWeapon();
  const hs = Math.hypot(me.vel.x, me.vel.z);
  const sp = (lerp(wp.spread, wp.adsSpread, me.ads) + (hs / PLAYER.run) * 0.012 + (me.phys.onGround ? 0 : 0.025)) * 260 + 4 + me.recoil * 120;
  const gap = Math.round(clamp(sp, 4, 40));
  if (hudCache.gap !== gap) {
    hudCache.gap = gap;
    const ch = $('crosshair').children;
    ch[1].style.top = `${-gap - 9}px`; ch[2].style.top = `${gap}px`;
    ch[3].style.left = `${-gap - 9}px`; ch[4].style.left = `${gap}px`;
    const rr = gap + 9; ch[5].style.width = ch[5].style.height = `${rr * 2}px`; ch[5].style.left = ch[5].style.top = `${-rr}px`;
  }
}
function updateNetInfo(fps) {
  const p = net.offline ? 0 : Math.round(clock.rtt);
  const cls = p < 90 ? '' : p < 180 ? 'warn' : 'bad';
  setHtml('pingTxt', net.offline ? 'OFFLINE' : `PING <b class="${cls}">${p}ms</b>`);
  setText('fpsTxt', `${fps} FPS`);
}
function sendPing() { net.send({ t: 'p', c: performance.now(), r: Math.round(clock.rtt) }); }

let hmTimer;
function hitmarker(kind) {
  const h = $('hitmarker');
  h.className = kind || '';
  h.style.transition = 'none'; h.style.opacity = 1; h.style.transform = 'rotate(45deg) scale(1.25)';
  clearTimeout(hmTimer);
  hmTimer = setTimeout(() => { h.style.transition = 'opacity .18s, transform .18s'; h.style.opacity = 0; h.style.transform = 'rotate(45deg) scale(1)'; }, kind === 'kill' ? 220 : 90);
}
let bannerTimer;
function banner(text, sub) {
  const b = $('banner');
  b.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : '');
  b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('show'), 1700);
}
function ammoBump() {
  const a = $('ammo');
  a.animate([{ transform: 'scale(1.18)', color: '#00f0ff' }, { transform: 'scale(1)' }], { duration: 120, easing: 'ease-out' });
}
let pickupTimer;
function showPickup(text, color) {
  const el = $('pickupMsg');
  el.textContent = text; el.style.color = color; el.style.opacity = 1;
  clearTimeout(pickupTimer); pickupTimer = setTimeout(() => (el.style.opacity = 0), 1200);
}
function feed(html, mine) {
  const kf = $('killfeed');
  const d = document.createElement('div'); d.className = 'kf' + (mine ? ' me' : ''); d.innerHTML = html;
  kf.appendChild(d);
  while (kf.children.length > 5) kf.firstChild.remove();
  setTimeout(() => d.remove(), 5000);
}
const feedSys = (html) => { const d = feed(html); const kf = $('killfeed'); kf.lastChild && kf.lastChild.classList.add('sys'); return d; };

const dmgPool = [];
for (let i = 0; i < 20; i++) { const d = document.createElement('div'); d.className = 'dn'; d.style.display = 'none'; $('dmgNums').appendChild(d); dmgPool.push({ el: d, life: 0, pos: new THREE.Vector3(), dx: 0 }); }
let dmgIdx = 0;
function dmgNumber(pos, n, hs) {
  const d = dmgPool[dmgIdx++ % dmgPool.length];
  d.pos.set(pos.x, pos.y + 2.1, pos.z); d.life = 0.75; d.dx = (Math.random() - 0.5) * 40;
  d.el.textContent = n; d.el.className = 'dn' + (hs ? ' hs' : ''); d.el.style.display = 'block';
}
function updateDmgNumbers(dt) {
  const w = window.innerWidth, h = window.innerHeight;
  for (const d of dmgPool) {
    if (d.life <= 0) continue;
    d.life -= dt;
    if (d.life <= 0) { d.el.style.display = 'none'; continue; }
    _v1.copy(d.pos).project(camera);
    if (_v1.z > 1) { d.el.style.display = 'none'; continue; }
    d.el.style.display = 'block';
    const t = 1 - d.life / 0.75;
    const x = (_v1.x * 0.5 + 0.5) * w + d.dx * t, y = (-_v1.y * 0.5 + 0.5) * h - t * 50;
    d.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 + (1 - t) * 0.3})`;
    d.el.style.opacity = Math.min(1, d.life * 3);
  }
}

// Minimap: map + you + enemies who recently fired (radar-style).
const mm = $('minimap').getContext('2d');
let mmLast = 0;
function drawMinimap(now) {
  if (now - mmLast < 80 || !minimapBase) return;
  mmLast = now;
  const S = 140, s = S / (map.H * 2);
  mm.clearRect(0, 0, S, S);
  mm.drawImage(minimapBase, 0, 0);
  for (const g of pickupMeshes) {
    if (!g.on) continue;
    mm.fillStyle = g.type === 'hp' ? '#00ff88' : '#ffd000';
    mm.fillRect((g.position.x + map.H) * s - 1.5, (g.position.z + map.H) * s - 1.5, 3, 3);
  }
  for (const a of avatars.values()) {
    if (!a.mesh.visible) continue;
    if (now - a.lastFired > 1800) continue;
    mm.fillStyle = '#ff2d6a';
    mm.beginPath(); mm.arc((a.pos.x + map.H) * s, (a.pos.z + map.H) * s, 3, 0, 7); mm.fill();
  }
  const x = (me.pos.x + map.H) * s, y = (me.pos.z + map.H) * s;
  mm.save(); mm.translate(x, y); mm.rotate(-me.yaw);
  mm.fillStyle = '#00f0ff';
  mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 4); mm.lineTo(0, 2); mm.lineTo(-4, 4); mm.closePath(); mm.fill();
  mm.restore();
}

function scoreRows(list, withPing) {
  return list.map((p, i) => `<tr class="${p.id === me.id ? 'me' : ''}"><td>${i + 1}</td><td>${esc(p.name)}${p.bot ? '<span class="bot">BOT</span>' : ''}</td><td class="n">${p.kills}</td><td class="n">${p.deaths}</td>${withPing ? `<td class="n">${p.bot ? '-' : p.id === me.id ? (net.offline ? 0 : Math.round(clock.rtt)) : p.ping}</td>` : ''}</tr>`).join('');
}
function renderScoreboard() {
  const list = [{ id: me.id, name: me.name, kills: me.kills, deaths: me.deaths, bot: false }, ...[...avatars.values()].map((a) => ({ id: a.id, name: a.name, kills: a.kills, deaths: a.deaths, bot: a.bot, ping: a.ping }))];
  list.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  $('sbBody').innerHTML = scoreRows(list, true);
}
let endTimer;
function showEnd(m) {
  matchState = 'end';
  me.firing = false;
  $('deathScreen').classList.add('hidden');
  $('winner').textContent = m.board.length ? `🏆 ${m.board[0].name} WINS` : '';
  $('endBody').innerHTML = scoreRows(m.board, false);
  $('endScreen').classList.remove('hidden');
  const until = performance.now() + m.in;
  const next = V.MAP_DEFS[m.next] ? V.MAP_DEFS[m.next].name : m.next;
  clearInterval(endTimer);
  endTimer = setInterval(() => {
    const s = Math.max(0, Math.ceil((until - performance.now()) / 1000));
    $('endNext').textContent = `Next map: ${next} in ${s}s`;
    if (s <= 0 || matchState !== 'end') clearInterval(endTimer);
  }, 250);
}

// ═════════════ MAIN LOOP ═════════════
let last = performance.now(), fpsFrames = 0, fpsTime = 0, fpsShown = 0, lowFpsTime = 0;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    fpsShown = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0;
    if (playing) {
      updateNetInfo(fpsShown);
      // Adaptive resolution when the device struggles.
      if (settings.quality === 'auto') {
        if (fpsShown < 45) lowFpsTime += 0.5; else lowFpsTime = Math.max(0, lowFpsTime - 0.25);
        if (lowFpsTime >= 2 && pixelRatio > 0.6) { pixelRatio = Math.max(0.6, pixelRatio - 0.15); resize(); lowFpsTime = 0; }
      }
    }
  }
  if (!map) return;
  if (!playing) {
    // Menu background: slow orbit around the arena.
    const t = now / 12000;
    camera.position.set(Math.cos(t) * 45, 16, Math.sin(t) * 45); camera.lookAt(0, 2, 0);
    if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
    renderer.clear(); renderer.render(scene, camera);
    return;
  }

  // Local simulation in small fixed-ish substeps for stable collisions.
  if (me.alive && matchState === 'play') {
    if (me.reloadUntil && now >= me.reloadUntil) finishReload();
    if (me.firing && curWeapon().auto) fire();
    let rem = dt;
    while (rem > 1e-4) { const step = Math.min(rem, 1 / 120); updateMovement(step); rem -= step; }
  }
  // Send state ~30Hz
  if (me.alive && now - lastStateSent >= 33 && matchState === 'play') {
    lastStateSent = now;
    const flags = (Math.hypot(me.vel.x, me.vel.z) > 1 ? 1 : 0) | (me.sliding ? 2 : 0) | (me.phys.onGround ? 0 : 4) | (me.ads > 0.5 ? 8 : 0);
    net.send({ t: 'u', x: r2(me.pos.x), y: r2(me.pos.y), z: r2(me.pos.z), yaw: r2(me.yaw), pitch: r2(me.pitch), f: flags, w: me.w, sp: me.sp });
  }
  if (now - lastPing > 2000) { lastPing = now; sendPing(); }

  updateCamera(dt, now);
  const rt = serverNow() - clock.interp;
  for (const a of avatars.values()) a.update(rt, dt, now);
  // Animate pads & pickups
  const t = now / 1000;
  for (const p of padMeshes) { const k = (t * 1.5 + p.position.x * 0.1) % 1; p.ring.position.y = 0.2 + k * 1.6; p.ring.material.opacity = 0.8 * (1 - k); p.ring.scale.setScalar(1 - k * 0.3); }
  for (const g of pickupMeshes) { if (!g.on) continue; g.gem.rotation.y = t * 2; g.gem.position.y = 1 + Math.sin(t * 2.5 + g.idx) * 0.15; g.halo.position.y = g.gem.position.y; }
  for (const f of decoAnim) f(dt, t);
  updateEffects(dt);
  updateDmgNumbers(dt);
  updateHud(now);
  drawMinimap(now);
  if (!$('scoreboard').classList.contains('hidden') && Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500)) renderScoreboard();

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(viewScene, viewCam);
}

// ═════════════ MENU & FLOW ═════════════
function buildSettingsUI(container) {
  container.innerHTML = `
    <span>Sensitivity</span><input type="range" min="0.1" max="4" step="0.05" data-k="sens"><span data-v="sens"></span>
    <span>Field of view</span><input type="range" min="70" max="120" step="1" data-k="fov"><span data-v="fov"></span>
    <span>Volume</span><input type="range" min="0" max="1" step="0.05" data-k="volume"><span data-v="volume"></span>
    <span>Crosshair</span><select data-k="chStyle"><option value="crossdot">Cross + dot</option><option value="cross">Cross</option><option value="dot">Dot</option><option value="circle">Circle + dot</option><option value="tstyle">T-shape</option></select><span></span>
    <span>Crosshair color</span><select data-k="chColor"><option value="#00f0ff">Cyan</option><option value="#ffffff">White</option><option value="#39ff14">Green</option><option value="#ffe600">Yellow</option><option value="#ff0055">Red</option><option value="#ff2bd6">Pink</option></select><span></span>
    <span>Crosshair size</span><input type="range" min="0.6" max="2.2" step="0.1" data-k="chSize"><span data-v="chSize"></span>
    <span>Quality</span><select data-k="quality"><option value="auto">Auto</option><option value="low">Low (fastest)</option><option value="medium">Medium</option><option value="high">High</option></select><span></span>`;
  const sync = () => container.querySelectorAll('[data-k]').forEach((el) => {
    el.value = settings[el.dataset.k];
    const out = container.querySelector(`[data-v="${el.dataset.k}"]`);
    if (out) out.textContent = el.dataset.k === 'volume' ? Math.round(settings.volume * 100) + '%' : settings[el.dataset.k];
  });
  container.addEventListener('input', (e) => {
    const k = e.target.dataset.k; if (!k) return;
    settings[k] = (k === 'quality' || k === 'chStyle' || k === 'chColor') ? e.target.value : +e.target.value;
    if (k.startsWith('ch')) applyCrosshair();
    if (k === 'volume') sound.setVolume(settings.volume);
    if (k === 'fov') resize();
    if (k === 'quality') { pixelRatio = basePixelRatio(); resize(); }
    saveSettings();
    document.querySelectorAll('.set-grid').forEach((g) => g._sync && g._sync());
  });
  container._sync = sync;
  sync();
}
function applyCrosshair() {
  const ch = $('crosshair');
  ch.className = 'st-' + settings.chStyle;
  ch.style.setProperty('--ch', settings.chColor);
  ch.style.setProperty('--chs', settings.chSize);
}
applyCrosshair();
buildSettingsUI($('settingsGrid'));
buildSettingsUI($('pauseSettings'));

const skinsEl = $('skins');
Object.entries(SKINS).forEach(([k, s]) => {
  const d = document.createElement('div');
  d.className = 'skin' + (k === settings.skin ? ' active' : '');
  d.style.background = s.hex; d.style.color = s.hex; d.title = k; d.dataset.skin = k;
  d.onclick = () => { settings.skin = k; skinsEl.querySelectorAll('.skin').forEach((x) => x.classList.toggle('active', x === d)); saveSettings(); };
  skinsEl.appendChild(d);
});
$('nameInput').value = settings.name || 'Player' + Math.floor(Math.random() * 900 + 100);
$('roomInput').value = settings.room || 'PUBLIC';
$('practiceMap').innerHTML = '<option value="RANDOM">Random</option>' + V.MAP_ORDER.map((k) => `<option value="${k}">${V.MAP_DEFS[k].name}</option>`).join('');
const qMap = new URLSearchParams(location.search).get('map');
if (qMap && V.MAP_DEFS[qMap]) $('practiceMap').value = qMap;

// Wake the (possibly sleeping) server while the player is still on the menu.
let serverReady = false;
async function probeServer() {
  const url = serverUrl();
  const st = $('serverStatus'), tx = $('serverText');
  st.className = 'wait'; tx.textContent = 'Connecting to game server…';
  const t0 = performance.now();
  for (let attempt = 0; attempt < 30 && !serverReady; attempt++) {
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(httpFromWs(url).replace(/\/$/, '') + '/health', { cache: 'no-store', signal: ctl.signal });
      clearTimeout(to);
      if (r.ok) {
        const j = await r.json();
        serverReady = true; st.className = 'ok';
        tx.textContent = `Server online · ${j.players} playing · ${Math.round(performance.now() - t0)}ms`;
        return;
      }
    } catch {}
    st.className = 'wait';
    tx.textContent = attempt < 2 ? 'Waking up game server… (free servers sleep — up to ~50s)' : `Waking up game server… ${Math.round((performance.now() - t0) / 1000)}s — or practice offline meanwhile`;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!serverReady) { st.className = 'bad'; tx.textContent = 'Game server unreachable — offline practice still works'; }
}
probeServer();

async function startGame(offline) {
  sound.init();
  settings.name = V.sanitizeName($('nameInput').value);
  settings.room = V.sanitizeRoom($('roomInput').value);
  saveSettings();
  me.name = settings.name; me.skin = settings.skin;
  buildViewmodels(me.skin);
  if (!IS_TOUCH) lockPointer(); // must happen during the click, before any await
  const pm = $('practiceMap').value;
  const join = { t: 'join', name: me.name, skin: me.skin, room: settings.room, map: pm === 'RANDOM' ? null : pm };
  const btn = $('playBtn');
  $('menuError').textContent = '';
  btn.disabled = true; $('offlineBtn').disabled = true;
  btn.textContent = offline ? 'PLAY ONLINE' : 'CONNECTING…';
  net.close();
  try {
    if (offline) await net.local(join);
    else await net.online(serverUrl(), join);
  } catch (e) {
    btn.disabled = false; $('offlineBtn').disabled = false; btn.textContent = 'PLAY ONLINE';
    $('menuError').textContent = 'Could not reach the game server. Try again in a few seconds, or play offline.';
    if (document.pointerLockElement) document.exitPointerLock();
    return;
  }
  btn.textContent = 'PLAY ONLINE';
  if (!IS_TOUCH && !locked()) setTimeout(needClick, 400);
  else { try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } catch {} }
}
function startPlaying() {
  playing = true; paused = false;
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('playBtn').disabled = false; $('offlineBtn').disabled = false;
  updateWeaponHud(true);
  banner(map.name, net.offline ? 'OFFLINE PRACTICE' : 'ROOM ' + roomName);
  sound.announce();
}
function showMenu(err) {
  playing = false; paused = false; me.alive = false;
  net.close();
  for (const a of avatars.values()) a.dispose();
  avatars.clear();
  if (document.pointerLockElement) document.exitPointerLock();
  ['hud', 'pauseScreen', 'deathScreen', 'endScreen'].forEach((id) => $(id).classList.add('hidden'));
  $('scoreboard').classList.add('hidden');
  $('menu').classList.remove('hidden');
  $('playBtn').disabled = false; $('offlineBtn').disabled = false; $('playBtn').textContent = 'PLAY ONLINE';
  $('menuError').textContent = err || '';
}
function onDisconnect() { showMenu('Disconnected from the server. Press PLAY to rejoin.'); }

$('playBtn').onclick = () => startGame(false);
$('offlineBtn').onclick = () => startGame(true);
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') startGame(false); });
$('roomInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') startGame(false); });
$('resumeBtn').onclick = (e) => { e.stopPropagation(); paused = false; $('pauseScreen').classList.add('hidden'); if (!IS_TOUCH) lockPointer(); };
$('pauseScreen').addEventListener('click', (e) => { if (e.target === $('pauseScreen')) $('resumeBtn').click(); });
$('leaveBtn').onclick = (e) => { e.stopPropagation(); showMenu(); };

// Debug/test hooks
window.__veckFire = () => fire();
window.__veck = { me, avatars, net, clock, get map() { return map; }, get playing() { return playing; } };

buildWorld('NEON');
camera.position.set(30, 14, 30); camera.lookAt(0, 0, 0);
window.__veckLoaded = true;
$('loading').classList.add('hidden');
requestAnimationFrame(frame);
