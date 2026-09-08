const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader']
  });

  const page1 = await browser.newPage();
  const page2 = await browser.newPage();

  page1.on('console', msg => console.log('[PAGE 1]', msg.text()));
  page2.on('console', msg => console.log('[PAGE 2]', msg.text()));

  await page1.goto('http://localhost:5000');
  await page1.fill('#playerNameInput', 'Om_Champion');
  await page1.fill('#passwordInput', 'Tharka');
  await page1.click('#playBtn');

  await page2.goto('http://localhost:5000');
  await page2.fill('#playerNameInput', 'Tharka_Soldier');
  await page2.fill('#passwordInput', 'Tharka');
  await page2.click('#playBtn');

  await page1.waitForTimeout(2000);

  // Position Player 1 and Player 2 facing each other
  await page1.evaluate(() => {
    player.pos.set(0, 2.4, 20);
    euler.set(0, 0, 0); // Looking towards -Z
    camera.quaternion.setFromEuler(euler);
  });
  await page2.evaluate(() => {
    player.pos.set(0, 2.4, -20);
    euler.set(0, Math.PI, 0); // Looking towards +Z
    camera.quaternion.setFromEuler(euler);
  });

  // Wait a moment for network heartbeat to propagate position
  await page1.waitForTimeout(1000);
  await page2.waitForTimeout(1000);

  const debugShoot = await page1.evaluate(() => {
    shootCurrentWeapon();
    const hitsCount = totalHits;
    const remoteCount = remotePlayers.size;
    let remotePos = null;
    remotePlayers.forEach(rp => {
      remotePos = { x: rp.mesh.position.x, y: rp.mesh.position.y, z: rp.mesh.position.z };
    });
    return { hitsCount, remoteCount, remotePos };
  });
  console.log('Debug shoot results:', debugShoot);

  await page2.waitForTimeout(1000);

  const hp2 = await page2.evaluate(() => ({ hp: player.hp, shield: player.shield }));
  console.log('Player 2 health after hit:', hp2);

  await browser.close();
})();
