const { chromium, devices } = require('playwright');

(async () => {
  console.log('🚀 Running Mobile Touch Controls & Collectible Potions / Ammo Test...');

  // 1. Emulate Mobile Phone (Pixel 7 / iPhone Touchscreen)
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader']
  });

  const mobileContext = await browser.newContext({
    viewport: { width: 844, height: 390 }, // Mobile Landscape (Phone standard for FPS)
    isMobile: true,
    hasTouch: true
  });

  const page = await mobileContext.newPage();
  await page.goto('http://localhost:5000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // Check that mobile controls class is active
  const isTouchClass = await page.evaluate(() => document.body.classList.contains('is-touch'));
  console.log('Mobile Touch Mode Detected & Active:', isTouchClass);

  if (!isTouchClass) {
    console.error('FAIL: Mobile touch mode was not detected on touch device!');
    process.exit(1);
  }

  // Authenticate on mobile
  await page.fill('#playerNameInput', 'Mobile_Warrior');
  await page.fill('#passwordInput', 'Tharka');
  await page.click('#playBtn');
  await page.waitForTimeout(1000);

  // Verify mobile touch controls are visible in HUD
  const mobileControlsVisible = await page.isVisible('#mobile-controls');
  const fireBtnVisible = await page.isVisible('#btn-fire');
  const jumpBtnVisible = await page.isVisible('#btn-jump');
  const joystickVisible = await page.isVisible('#touch-joystick-zone');

  console.log('Mobile Controls Visible:', {
    mobileControlsVisible,
    fireBtnVisible,
    jumpBtnVisible,
    joystickVisible
  });

  if (!mobileControlsVisible || !fireBtnVisible || !joystickVisible) {
    console.error('FAIL: Mobile touch control buttons are not visible in HUD!');
    process.exit(1);
  }

  // 2. Test Collectibles (Life Potions & Bullet Ammo Pods)
  const initialHp = await page.evaluate(() => {
    player.hp = 50; // Simulate wounded player
    return player.hp;
  });
  console.log('Player Damaged HP before potion:', initialHp);

  // Teleport player near a life potion at open slot (25, 1.4, 25)
  await page.evaluate(() => {
    player.pos.set(25, 2.4, 25);
  });
  await page.waitForTimeout(600);

  const restoredHp = await page.evaluate(() => player.hp);
  console.log('Player HP after collecting Bio-Nanite Potion:', restoredHp);

  if (restoredHp <= initialHp) {
    console.error('FAIL: Potion was not collected!');
    process.exit(1);
  }
  console.log(`Life potion verified! Restored +${restoredHp - initialHp} HP`);

  // Test Ammo Pod Collection
  const initialAmmoReserve = await page.evaluate(() => {
    weapons[currentWeaponIdx].reserve = 20;
    return weapons[currentWeaponIdx].reserve;
  });
  console.log('Player Ammo Reserve before Ammo Pod:', initialAmmoReserve);

  // Teleport near Ammo Pod at (50, 1.4, 20)
  await page.evaluate(() => {
    player.pos.set(50, 2.4, 20);
  });
  await page.waitForTimeout(600);

  const collectedAmmoReserve = await page.evaluate(() => weapons[currentWeaponIdx].reserve);
  console.log('Player Ammo Reserve after collecting Ammo Pod:', collectedAmmoReserve);

  if (collectedAmmoReserve <= initialAmmoReserve) {
    console.error('FAIL: Ammo pod was not collected!');
    process.exit(1);
  }
  console.log(`Ammo Pod verified! Restored +${collectedAmmoReserve - initialAmmoReserve} Bullets`);

  // 3. Test Mobile Touch Joystick Movement
  const posBeforeJoy = await page.evaluate(() => ({ x: player.pos.x, z: player.pos.z }));
  await page.evaluate(() => {
    // Simulate joystick pushed forward-right
    joystickVector = { x: 0.8, y: -0.8 };
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => { joystickVector = { x: 0, y: 0 }; });

  const posAfterJoy = await page.evaluate(() => ({ x: player.pos.x, z: player.pos.z }));
  const joyDist = Math.hypot(posAfterJoy.x - posBeforeJoy.x, posAfterJoy.z - posBeforeJoy.z);
  console.log('Distance moved with mobile virtual joystick:', joyDist.toFixed(2), 'units');

  if (joyDist < 1.0) {
    console.error('FAIL: Virtual joystick movement failed!');
    process.exit(1);
  }

  // Capture mobile screenshots
  await page.screenshot({ path: 'C:/Users/Administrator/workspace/veck-clone/test-mobile-hud.png' });
  console.log('Saved screenshot: test-mobile-hud.png');

  await browser.close();
  console.log('🎉 MOBILE TOUCH CONTROLS, POTIONS, & AMMO PODS 100% VERIFIED!');
})();
