const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  await page.goto('http://localhost:8080');
  
  // Click Host
  await page.evaluate(() => {
     document.getElementById('playerName').value = 'Test';
     document.getElementById('hostBtn').click();
  });
  
  await page.waitForTimeout(1000);
  
  await browser.close();
})();
