const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader']
  });
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', err => errors.push(err.toString()));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('Failed to load resource')) errors.push(txt);
    }
  });

  await page.goto('http://localhost:5000', { waitUntil: 'domcontentloaded' });
  await page.click('#playBtn');
  await page.waitForTimeout(1200);

  const checks = await page.evaluate(() => {
    let maxAbsZ = 0;
    obstacleMeshes.forEach(c => { if (Math.abs(c.position.z) > maxAbsZ) maxAbsZ = Math.abs(c.position.z); });
    return {
      hasRivalBot: !!rivalBot,
      arenaSize: ARENA_SIZE,
      obstacleCount: obstacleMeshes.length,
      maxWallZ: maxAbsZ,
    };
  });
  console.log('hasRivalBot (expect true, single 1v1 boss):', checks.hasRivalBot);
  console.log('ARENA_SIZE (expect >= 260, bigger arena):', checks.arenaSize);
  console.log('obstacleCount (expect > 0):', checks.obstacleCount);
  console.log('maxWallZ (expect ARENA_SIZE/2):', checks.maxWallZ);

  if (!checks.hasRivalBot) { console.error('FAIL: no single rival bot found'); process.exit(1); }
  if (checks.arenaSize < 260) { console.error('FAIL: arena not big enough'); process.exit(1); }
  if (checks.maxWallZ !== checks.arenaSize / 2) { console.error('FAIL: wall placement mismatch'); process.exit(1); }

  // Obstacle bullet-blocking: aim through the central fortress at the rival bot placed far behind it.
  const blockedShot = await page.evaluate(() => {
    rivalBot.isDead = false;
    rivalBot.hp = rivalBot.maxHp;
    rivalBot.mesh.position.set(0, 1, -100);
    rivalBot.mesh.updateMatrixWorld(true);
    player.pos.set(0, 2.5, 60);
    camera.position.copy(player.pos);
    camera.lookAt(0, 2.5, -100); // ray passes straight through the central fortress
    camera.updateMatrixWorld(true);
    lastShotTime = 0;
    shootCurrentWeapon();
    return { hpAfter: rivalBot.hp };
  });
  console.log('Rival HP after shot through obstacle (expect unchanged, maxHp):', blockedShot.hpAfter);
  if (blockedShot.hpAfter < 300) {
    console.error('FAIL: bullet passed through the obstacle and damaged the rival bot behind it');
    process.exit(1);
  }

  // Clear line-of-sight: bullet SHOULD register damage with nothing blocking.
  await page.waitForTimeout(200);
  const clearShot = await page.evaluate(() => {
    rivalBot.isDead = false;
    rivalBot.hp = rivalBot.maxHp;
    rivalBot.mesh.position.set(0, 0, -10);
    rivalBot.mesh.updateMatrixWorld(true);
    player.pos.set(0, 2.2, 0);
    camera.position.copy(player.pos);
    camera.lookAt(0, 2.0, -10);
    camera.updateMatrixWorld(true);
    lastShotTime = 0;
    shootCurrentWeapon();
    return { hpAfter: rivalBot.hp };
  });
  console.log('Rival HP after clear line-of-sight shot (expect < maxHp):', clearShot.hpAfter);
  if (clearShot.hpAfter >= 300) {
    console.error('FAIL: clear line-of-sight shot did not register damage on the rival bot');
    process.exit(1);
  }

  await page.screenshot({ path: 'C:/Users/Administrator/.openclaw/workspace/veck-clone/test-obstacles.png', fullPage: false });

  await browser.close();

  if (errors.length > 0) {
    console.error('JavaScript errors encountered:', errors);
    process.exit(1);
  } else {
    console.log('ALL OBSTACLE / SINGLE-RIVAL / ARENA-SIZE TESTS PASSED CLEANLY WITH ZERO ERRORS!');
  }
})();
