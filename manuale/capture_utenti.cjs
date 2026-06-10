const puppeteer = require('puppeteer');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE = 'http://localhost:5173';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  // Login as admin
  await page.goto(`${BASE}/backoffice/login`, { waitUntil: 'networkidle0' });
  await wait(800);
  const emailInput = await page.$('input[type="email"], input[name="email"]');
  if (emailInput) { await emailInput.click({ clickCount: 3 }); await emailInput.type('admin@nsm.it'); }
  const passInput = await page.$('input[type="password"]');
  if (passInput) { await passInput.click({ clickCount: 3 }); await passInput.type('test1234'); }
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.trim().toLowerCase().includes('acced')) { await btn.click(); break; }
  }
  await wait(3000);

  // Navigate to user management
  await page.goto(`${BASE}/backoffice/utenti`, { waitUntil: 'networkidle0' });
  await wait(2000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'admin_08_gestione_utenti.png') });
  console.log('OK: admin_08_gestione_utenti.png');

  // Open "Nuovo utente" modal
  const allButtons = await page.$$('button');
  for (const btn of allButtons) {
    const text = await page.evaluate(el => el.textContent.trim(), btn);
    if (text.includes('Nuovo utente')) { await btn.click(); break; }
  }
  await wait(800);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'admin_09_nuovo_utente_modal.png') });
  console.log('OK: admin_09_nuovo_utente_modal.png');

  await browser.close();
  console.log('Done!');
})();
