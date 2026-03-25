const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  await page.goto('http://localhost:8080');
  
  // Enter name, host room
  await page.evaluate(() => {
     document.getElementById('playerName').value = 'Test';
     document.getElementById('hostBtn').click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Start Game
  await page.evaluate(() => {
     document.getElementById('startGameBtn').click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Simulate shooting
  await page.evaluate(() => {
     window.dispatchEvent(new MouseEvent('mousedown'));
  });
  
  await new Promise(r => setTimeout(r, 500));
  
  await browser.close();
})();
