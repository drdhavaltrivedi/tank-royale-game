const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  let crashed = false;
  page.on('console', msg => {
      if(msg.type() === 'error') console.error('PAGE ERROR LOG:', msg.text());
  });
  page.on('pageerror', error => {
      console.error('PAGE EXCEPTION:', error.message);
      crashed = true;
  });
  
  await page.goto('http://localhost:8080');
  
  await page.evaluate(() => {
     document.getElementById('playerName').value = 'Test';
     document.getElementById('hostBtn').click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  await page.evaluate(() => {
     document.getElementById('startGameBtn').click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Actually shoot!
  await page.evaluate(() => {
     // simulate full mousedown on canvas
     const cvs = document.getElementById('gameCanvas');
     const r = cvs.getBoundingClientRect();
     const mev = new MouseEvent('mousedown', {
         bubbles: true, cancelable: true, clientX: r.left + r.width/2, clientY: r.top + r.height/2
     });
     cvs.dispatchEvent(mev);
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  await browser.close();
})();
