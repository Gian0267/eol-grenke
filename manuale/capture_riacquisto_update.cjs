const puppeteer = require('puppeteer');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE = 'http://localhost:5173';

// Delta SAS — nessuna decisione, valido 2026-08-12
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250cmF0dG9fZW9sX2lkIjoiM2U1NzU3N2UtYjYxOS00OGFiLTkyNjQtNTYxMDE0YjlhZDdkIiwiY2xpZW50ZV9pZCI6IjJkMjZiYmIyLWM3Y2QtNDQ1Yy04NTEzLTg5OTI1YjM3M2Q3MCIsImV4cCI6MTc4NjkxNzYwMCwiaWF0IjoxNzc5MTg1NDY4fQ.2W1ctVKenISzUUz9YQsW6LfovUD98OYNpCSUIsrrC8k';

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

  // Step 1 — riepilogo prezzo (ora con "Stai prenotando l'acquisto di")
  console.log('Step 1: riepilogo prezzo...');
  await page.goto(`${BASE}/pratica/${TOKEN}/riacquisto`, { waitUntil: 'networkidle0' });
  await wait(2000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '19_riacquisto_step1_prezzo.png') });
  console.log('OK: 19_riacquisto_step1_prezzo.png');

  // Step 2a — click "No, confermo la prenotazione" → apre T&C
  console.log('Step 2: T&C con pulsante aggiornato...');
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('confermo la prenotazione')) {
      await btn.click();
      break;
    }
  }
  await waitForText(page, 'Termini e condizioni');
  await wait(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '20_riacquisto_step2_tc.png') });
  console.log('OK: 20_riacquisto_step2_tc.png');

  // Step 2b — spunta checkbox → appare scelta OTP
  const checkbox = await page.$('input[type="checkbox"]');
  if (checkbox) await checkbox.click();
  await wait(800);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '20b_riacquisto_step2_otp_scelta.png') });
  console.log('OK: 20b_riacquisto_step2_otp_scelta.png');

  await browser.close();
  console.log('Done!');
})();
