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
  await page2.goto('http://localhost:5000');

  await page1.fill('#passwordInput', 'Tharka');
  await page1.click('#playBtn');

  await page2.fill('#passwordInput', 'Tharka');
  await page2.fill('#playerNameInput', 'Viper');
  await page2.click('#playBtn');

  await page1.waitForTimeout(2000);

  const count1 = await page1.evaluate(() => remotePlayers.size);
  const count2 = await page2.evaluate(() => remotePlayers.size);
  console.log('Final counts:', { count1, count2 });

  await browser.close();
})();
