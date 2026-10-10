// End-to-end check: two browsers join the same room, see each other, shoot, and get server-confirmed damage.
// Usage: node server/server.js & node tests/e2e.js [baseUrl]
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:5000';
const SHOTS = process.env.SHOTS_DIR;

(async () => {
  const launchOpts = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  if (process.env.PW_CHROMIUM) launchOpts.executablePath = process.env.PW_CHROMIUM;
  if (process.env.HTTPS_PROXY) launchOpts.proxy = { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' };
  const browser = await chromium.launch(launchOpts);
  const errors = [];
  const open = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`); });
    await page.goto(BASE + '/?room=E2E');
    await page.waitForFunction(() => window.__veck, null, { timeout: 30000 });
    await page.fill('#nameInput', name);
    await page.fill('#roomInput', 'E2ETEST');
    await page.click('#playBtn');
    await page.waitForFunction(() => window.__veck.playing && window.__veck.me.alive, null, { timeout: 15000 });
    return page;
  };
  const a = await open('Alpha');
  const b = await open('Bravo');
  await a.waitForTimeout(1500);
  const info = await a.evaluate(() => ({ id: window.__veck.me.id, avatars: [...window.__veck.avatars.values()].map((x) => x.name) }));
  console.log('Alpha sees:', info.avatars);
  if (!info.avatars.includes('Bravo')) throw new Error('Alpha does not see Bravo');

  // Teleport Bravo in front of Alpha (client-authoritative movement) and have Alpha shoot.
  const bId = await b.evaluate(() => window.__veck.me.id);
  await a.evaluate(() => { const m = window.__veck.me; m.pos.set(12, 0, 47); m.vel.set(0, 0, 0); m.yaw = 0; m.pitch = 0; });
  await b.evaluate(() => { const m = window.__veck.me; m.pos.set(12, 0, 39); m.vel.set(0, 0, 0); });
  await a.waitForTimeout(1600);
  const hpBefore = await b.evaluate(() => window.__veck.me.hp);
  await a.evaluate(() => { const v = window.__veck; v.me.firing = false; });
  for (let i = 0; i < 6; i++) {
    await a.evaluate((id) => {
      const v = window.__veck, av = v.avatars.get(id);
      // aim at Bravo's chest
      const dx = av.pos.x - v.me.pos.x, dz = av.pos.z - v.me.pos.z, dy = av.pos.y + 1.1 - (v.me.pos.y + 1.62);
      v.me.yaw = Math.atan2(-dx, -dz); v.me.pitch = Math.atan2(dy, Math.hypot(dx, dz)); v.me.recoil = 0; v.me.recoilYaw = 0;
      v.me.lastShot = 0; v.me.reloadUntil = 0; v.me.switchUntil = 0;
      window.__veckFire && window.__veckFire();
    }, bId);
    await a.waitForTimeout(150);
  }
  await a.waitForTimeout(500);
  const hpAfter = await b.evaluate(() => window.__veck.me.hp);
  console.log('Bravo HP before/after:', hpBefore, hpAfter);
  if (!(hpAfter < hpBefore)) throw new Error('Damage was not applied');

  const ping = await a.evaluate(() => Math.round(window.__veck.clock.rtt));
  const fps = await a.evaluate(() => document.getElementById('fpsTxt').textContent);
  console.log('Ping', ping, 'ms |', fps);
  if (SHOTS) { await a.screenshot({ path: SHOTS + '/alpha.png' }); await b.screenshot({ path: SHOTS + '/bravo.png' }); }
  // Reload animation screenshot
  if (SHOTS) { await a.evaluate(() => { const m = window.__veck.me; m.ammo[0] = 3; }); await a.keyboard.press('KeyR'); await a.waitForTimeout(500); await a.screenshot({ path: SHOTS + '/reload.png' }); }
  if (errors.length) { console.log('Page errors:\n' + errors.join('\n')); throw new Error('page errors'); }
  console.log('E2E PASS');
  await browser.close();
})().catch((e) => { console.error('E2E FAIL:', e.message); process.exit(1); });
