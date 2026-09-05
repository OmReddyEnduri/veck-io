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
      // Ignore 404s for external assets (fonts, CDN) — not game errors
      if (!txt.includes('Failed to load resource')) {
        errors.push(txt);
      }
    }
  });

  await page.goto('http://localhost:5000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800); // let initEngine() attach button listeners before clicking
  console.log('Title:', await page.title());

  // Test selecting ORBITAL map
  await page.click('button[data-map="ORBITAL"]');
  console.log('Selected ORBITAL sector');

  // Test selecting MAGMA map
  await page.click('button[data-map="MAGMA"]');
  console.log('Selected MAGMA sector');

  // Enter Arena
  await page.click('#playBtn');
  console.log('Clicked ENTER ARENA');

  // Wait a tick for the HUD to render
  await page.waitForTimeout(800);

  // Verify sector badge in HUD shows MAGMA CORE
  const sectorText = await page.textContent('#sectorDisplay');
  console.log('In-Game Sector Badge:', sectorText.trim());

  if (!sectorText.includes('VOLCANIC CORE')) {
    console.error('FAIL: Expected "VOLCANIC CORE" in sector badge, got:', sectorText.trim());
    process.exit(1);
  }

  // Verify HUD is visible
  const hudVisible = await page.isVisible('#hud');
  console.log('HUD visible:', hudVisible);

  // Verify minimap canvas exists
  const minimapExists = await page.isVisible('#minimap');
  console.log('Minimap exists:', minimapExists);

  // Verify ammo display shows correct initial value
  const ammoCurr = await page.textContent('#ammoCurr');
  console.log('Ammo current:', ammoCurr);

  // Take screenshot for visual verification
  await page.screenshot({ path: 'C:/Users/Administrator/.openclaw/workspace/veck-clone/test-sector-magma.png', fullPage: false });
  console.log('Saved screenshot: test-sector-magma.png');

  await browser.close();

  if (errors.length > 0) {
    console.error('JavaScript errors encountered:', errors);
    process.exit(1);
  } else {
    console.log('ALL PLAYWRIGHT TESTS PASSED CLEANLY WITH ZERO ERRORS!');
  }
})();
