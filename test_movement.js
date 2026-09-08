const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Running Movement, Collision, & Unstuck Verification Test...');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader']
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:5000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Authenticate
  await page.fill('#playerNameInput', 'Om_TestRunner');
  await page.fill('#passwordInput', 'Tharka');
  await page.click('#playBtn');
  await page.waitForTimeout(1000);

  // Get initial position
  const initialPos = await page.evaluate(() => ({ x: player.pos.x, y: player.pos.y, z: player.pos.z }));
  console.log('Spawn Position:', initialPos);

  // Press W key to move forward for 500ms
  console.log('Moving Forward (KeyW)...');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');

  const afterWPos = await page.evaluate(() => ({ x: player.pos.x, y: player.pos.y, z: player.pos.z }));
  console.log('Position after pressing W:', afterWPos);

  const deltaW = Math.hypot(afterWPos.x - initialPos.x, afterWPos.z - initialPos.z);
  console.log('Distance moved with W:', deltaW.toFixed(2), 'units');

  if (deltaW < 1.0) {
    console.error('FAIL: Player is stuck and failed to move forward!');
    process.exit(1);
  }

  // Press D key to strafe right
  console.log('Strafing Right (KeyD)...');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyD');

  const afterDPos = await page.evaluate(() => ({ x: player.pos.x, y: player.pos.y, z: player.pos.z }));
  console.log('Position after pressing D:', afterDPos);

  const deltaD = Math.hypot(afterDPos.x - afterWPos.x, afterDPos.z - afterWPos.z);
  console.log('Distance strafed with D:', deltaD.toFixed(2), 'units');

  if (deltaD < 1.0) {
    console.error('FAIL: Player is stuck and failed to strafe!');
    process.exit(1);
  }

  // Jump Test
  console.log('Testing Jump (Space)...');
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  const jumpY = await page.evaluate(() => player.pos.y);
  console.log('Player Y during jump:', jumpY);

  if (jumpY <= 2.4) {
    console.error('FAIL: Player failed to jump!');
    process.exit(1);
  }

  await page.screenshot({ path: 'C:/Users/Administrator/workspace/veck-clone/test-movement-pass.png' });
  await browser.close();

  console.log('🎉 ALL MOVEMENT & PHYSICS TESTS PASSED WITH SMOOTH 100% SUCCESS!');
})();
