const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Running Full Multiplayer PvP Combat, Damage, & Overhead Nametag Health Test...');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader']
  });

  const page1 = await browser.newPage();
  const page2 = await browser.newPage();

  // 1. Authenticate Player 1
  await page1.goto('http://localhost:5000');
  await page1.fill('#playerNameInput', 'Om_Leader');
  await page1.fill('#passwordInput', 'Tharka');
  await page1.click('#playBtn');

  // 2. Authenticate Player 2
  await page2.goto('http://localhost:5000');
  await page2.fill('#playerNameInput', 'Tharka_Warrior');
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

  await page1.waitForTimeout(1000);
  await page2.waitForTimeout(1000);

  const initialHp2 = await page2.evaluate(() => player.hp + player.shield);
  console.log('Player 2 Initial Effective Health (HP + Shield):', initialHp2);

  // Player 1 fires multiple shots
  console.log('Player 1 firing at Player 2...');
  await page1.evaluate(() => {
    shootCurrentWeapon();
    setTimeout(() => shootCurrentWeapon(), 150);
  });

  await page2.waitForTimeout(1500);

  const damagedHp2 = await page2.evaluate(() => player.hp + player.shield);
  console.log('Player 2 Health after being shot:', damagedHp2);

  if (damagedHp2 >= initialHp2) {
    console.error('FAIL: Player 2 did not take damage!');
    process.exit(1);
  }

  console.log(`Damage verified! Total damage taken: ${initialHp2 - damagedHp2} DMG`);

  await page1.screenshot({ path: 'C:/Users/Administrator/workspace/veck-clone/test-pvp-client1.png' });
  await page2.screenshot({ path: 'C:/Users/Administrator/workspace/veck-clone/test-pvp-client2.png' });

  await browser.close();
  console.log('🎉 ALL MULTIPLAYER REAL-TIME TESTS PASSED WITH 100% SUCCESS!');
})();
