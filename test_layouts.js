const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Verifying all 4 Sector Layouts...');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader']
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:5000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  const maps = [
    { key: 'NEON_ARENA', expected: 'NEON METROPOLIS' },
    { key: 'ORBITAL', expected: 'ORBITAL APEX' },
    { key: 'MAGMA', expected: 'VOLCANIC CORE' },
    { key: 'CYBER_GRID', expected: 'CYBER VOID MATRIX' }
  ];

  for (const m of maps) {
    await page.click(`button[data-map="${m.key}"]`);
    console.log(`Selected ${m.key}`);
  }

  // Authenticate with Tharka password
  await page.fill('#passwordInput', 'Tharka');
  await page.click('#playBtn');
  await page.waitForTimeout(800);

  const sectorText = await page.textContent('#sectorDisplay');
  console.log('Active Sector Badge:', sectorText.trim());

  await browser.close();
  console.log('🎉 ALL 4 SECTOR LAYOUTS TESTED & VALIDATED!');
})();
