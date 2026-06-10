const puppeteer = require('puppeteer');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE = 'http://localhost:5173';

// Psi Robotics SPA — nessuna decisione registrata (il click precedente era fallito)
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250cmF0dG9fZW9sX2lkIjoiMjc1MGUxMWEtNmNhMi00MzI0LWI1Y2QtMzAyOTNkZjY5ZmRkIiwiY2xpZW50ZV9pZCI6IjgzNjE1YjU5LTI5M2MtNDJiOS04YTdjLWI4ODYyMjgyYjBmYiIsImV4cCI6MTc4ODQ3MjgwMCwiaWF0IjoxNzc5MTg1NDY5fQ.NiSY9xghDUWSVG5b-1yDmcmruO0rCD5rLVc3GNzpjnM';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
async function waitForText(page, text, timeout = 8000) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  await page.goto(`${BASE}/pratica/${TOKEN}/restituzione`, { waitUntil: 'networkidle0' });
  await wait(1500);

  // Spunta il checkbox obbligatorio
  const checkbox = await page.$('input[type="checkbox"]');
  if (checkbox) {
    await checkbox.click();
    await wait(500);
    console.log('Checkbox spuntato');
  }

  // Clicca "Procedi" (ora abilitato)
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Procedi')) {
      await btn.click();
      break;
    }
  }

  // Attende step 2: scelta OTP (Email o SMS)
  await waitForText(page, 'Verifica la tua identit');
  await wait(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '18b_restituzione_otp_scelta.png') });
  console.log('OK: 18b_restituzione_otp_scelta.png');

  // Clicca "Ricevi via Email"
  const allButtons = await page.$$('button');
  for (const btn of allButtons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Email')) {
      await btn.click();
      break;
    }
  }

  // Attende step 3: inserimento codice
  await waitForText(page, 'Inserisci il codice');
  await wait(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '18c_restituzione_otp_inserimento.png') });
  console.log('OK: 18c_restituzione_otp_inserimento.png');

  await browser.close();
  console.log('Done!');
})();
