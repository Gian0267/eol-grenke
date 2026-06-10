const puppeteer = require('puppeteer');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE = 'http://localhost:5173';

// Epsilon Studio — nessuna decisione, valido 2026-09-11
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250cmF0dG9fZW9sX2lkIjoiMmM1OTM3ZDYtYzhkZS00ZDE2LWExOGUtZDA3Yjg3YzU3NGY3IiwiY2xpZW50ZV9pZCI6IjcwZDk3NTY0LTQ2MmEtNDQ4MC04MjA4LTc0ZTFmZjhkZTUyZSIsImV4cCI6MTc4OTUwOTYwMCwiaWF0IjoxNzc5MTg1NDY4fQ.DVirv55ej0AuQfgE5YfJGJQdSy0frr9Jmacx0OsCn8Q';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox'],
  });

  // 1. Area cliente — le 4 card
  console.log('Capturing area cliente cards...');
  const clientePage = await browser.newPage();
  await clientePage.goto(`${BASE}/pratica/${TOKEN}`, { waitUntil: 'networkidle0' });
  await wait(2000);
  await clientePage.screenshot({ path: path.join(SCREENSHOTS_DIR, '13_area_cliente.png') });
  console.log('OK: 13_area_cliente.png');
  await clientePage.close();

  // 2. Impostazioni > Area Cliente — anteprima card
  console.log('Logging in for impostazioni...');
  const backPage = await browser.newPage();
  await backPage.goto(`${BASE}/backoffice/login`, { waitUntil: 'networkidle0' });
  await wait(800);
  const emailInput = await backPage.$('input[type="email"], input[name="email"]');
  if (emailInput) { await emailInput.click({ clickCount: 3 }); await emailInput.type('backoffice@nsm.it'); }
  const passInput = await backPage.$('input[type="password"]');
  if (passInput) { await passInput.click({ clickCount: 3 }); await passInput.type('test1234'); }
  const buttons = await backPage.$$('button');
  for (const btn of buttons) {
    const text = await backPage.evaluate(el => el.textContent, btn);
    if (text && text.trim().toLowerCase().includes('acced')) { await btn.click(); break; }
  }
  await wait(3000);

  await backPage.goto(`${BASE}/backoffice/impostazioni`, { waitUntil: 'networkidle0' });
  await wait(1500);

  // Click "Area Cliente" tab
  const allButtons = await backPage.$$('button');
  for (const btn of allButtons) {
    const text = await backPage.evaluate(el => el.textContent.trim(), btn);
    if (text === 'Area Cliente') { await btn.click(); await wait(1200); break; }
  }
  await backPage.screenshot({ path: path.join(SCREENSHOTS_DIR, 'admin_04_area_cliente.png') });
  console.log('OK: admin_04_area_cliente.png');
  await backPage.close();

  await browser.close();
  console.log('Done!');
})();
