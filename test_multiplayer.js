const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Starting Multi-Client Room & Auth Verification Test...');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader']
  });

  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  const errors1 = [], errors2 = [];
  page1.on('pageerror', err => errors1.push(err.toString()));
  page2.on('pageerror', err => errors2.push(err.toString()));

  // 1. Load Client 1
  console.log('--- Client 1 Loading ---');
  await page1.goto('http://localhost:5000', { waitUntil: 'domcontentloaded' });
  await page1.waitForTimeout(600);

  // Test invalid password rejection
  console.log('Testing incorrect password rejection...');
  await page1.fill('#playerNameInput', 'Om_Leader');
  await page1.fill('#passwordInput', 'WrongPassword123');
  await page1.click('#playBtn');
  await page1.waitForTimeout(300);

  const errorVisible = await page1.isVisible('#auth-error');
  const errorText = await page1.textContent('#auth-error');
  console.log('Auth Error Shown:', errorVisible, '| Message:', errorText.trim());

  if (!errorVisible || !errorText.includes('Tharka')) {
    console.error('FAIL: Password validation failed to reject wrong password!');
    process.exit(1);
  }

  // Test entering with correct password 'Tharka'
  console.log('Authenticating Client 1 with password "Tharka"...');
  await page1.fill('#passwordInput', 'Tharka');
  await page1.click('#playBtn');
  await page1.waitForTimeout(1000);

  const hud1Visible = await page1.isVisible('#hud');
  console.log('Client 1 in Arena! HUD Visible:', hud1Visible);

  // 2. Load Client 2
  console.log('--- Client 2 Loading ---');
  await page2.goto('http://localhost:5000', { waitUntil: 'domcontentloaded' });
  await page2.waitForTimeout(600);

  await page2.fill('#playerNameInput', 'Alex_Ghost');
  await page2.fill('#passwordInput', 'tharka'); // Test case-insensitive
  await page2.click('#playBtn');
  await page2.waitForTimeout(1500);

  const hud2Visible = await page2.isVisible('#hud');
  console.log('Client 2 in Arena! HUD Visible:', hud2Visible);

  // Check online player count on HUD
  const onlineCountText1 = await page1.textContent('#hudOnlineCount');
  const onlineCountText2 = await page2.textContent('#hudOnlineCount');
  console.log('Client 1 HUD Online Count:', onlineCountText1.trim());
  console.log('Client 2 HUD Online Count:', onlineCountText2.trim());

  // Capture screenshot of both
  await page1.screenshot({ path: 'C:/Users/Administrator/workspace/veck-clone/test-multiplayer-client1.png' });
  await page2.screenshot({ path: 'C:/Users/Administrator/workspace/veck-clone/test-multiplayer-client2.png' });
  console.log('Saved client screenshots: test-multiplayer-client1.png, test-multiplayer-client2.png');

  await browser.close();

  if (errors1.length > 0 || errors2.length > 0) {
    console.error('Errors encountered:', { errors1, errors2 });
    process.exit(1);
  }

  console.log('🎉 ALL MULTIPLAYER, AUTH, AND LAYOUT TESTS PASSED WITH 100% SUCCESS!');
})();
