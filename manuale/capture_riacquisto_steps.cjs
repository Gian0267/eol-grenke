const puppeteer = require('puppeteer');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE = 'http://localhost:5173';

// Chi Marketing SRL — 0 decisioni, valido fino al 2026-08-21
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250cmF0dG9fZW9sX2lkIjoiMWVmYmYwMTItNDQyOC00ZWFmLWJiOGQtOTc0NjA5Njc4NGI2IiwiY2xpZW50ZV9pZCI6ImY5MDI3YWJhLWIxMjctNDA5MC1iMzBlLTA1MWYzOTMxZjVhYyIsImV4cCI6MTc4Nzg2ODAwMCwiaWF0IjoxNzc5MTg1NDY5fQ.l-IvI5V1IcnrNGu7YAhBXuyYjZFF8zE4cu2ajyMGXD8';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForText(page, text, timeout = 8000) {
  await page.waitForFunction(
    (t) => document.body.innerText.includes(t),
    { timeout },
    text
  );
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  // ── STEP 1 — Riepilogo prezzo + "Hai dubbi?" ──
  console.log('Step 1: prezzo + dubbi...');
  await page.goto(`${BASE}/pratica/${TOKEN}/riacquisto`, { waitUntil: 'networkidle0' });
  await wait(2000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '19_riacquisto_step1_prezzo.png') });
  console.log('OK: 19_riacquisto_step1_prezzo.png');

  // ── STEP 2a — Clicca "No, procedo con il pagamento" → T&C ──
  console.log('Step 2: clic su "procedo"...');
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('procedo con il pagamento')) {
      await btn.click();
      break;
    }
  }
  // Attende che compaiano i T&C
  await waitForText(page, 'Termini e condizioni');
  await wait(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '20_riacquisto_step2_tc.png') });
  console.log('OK: 20_riacquisto_step2_tc.png');

  // ── STEP 2b — Spunta il checkbox T&C → appare scelta OTP ──
  console.log('Step 2b: spunta TC checkbox...');
  const checkbox = await page.$('input[type="checkbox"]');
  if (checkbox) await checkbox.click();
  await wait(800);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '20b_riacquisto_step2_otp_scelta.png') });
  console.log('OK: 20b_riacquisto_step2_otp_scelta.png');

  // ── STEP 3 — Clicca "Ricevi via Email" → OTP input ──
  console.log('Step 3: richiede OTP via email...');
  const allButtons = await page.$$('button');
  for (const btn of allButtons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Ricevi via Email')) {
      await btn.click();
      break;
    }
  }
  await waitForText(page, 'Inserisci il codice');
  await wait(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '21_riacquisto_step3_otp.png') });
  console.log('OK: 21_riacquisto_step3_otp.png');

  // ── STEP 4 — Inserisce OTP 123456 e verifica ──
  console.log('Step 4: inserisce OTP 123456...');
  const otpInput = await page.$('input[inputmode="numeric"]');
  if (otpInput) {
    await otpInput.click({ clickCount: 3 });
    await otpInput.type('123456');
    await wait(500);
  }
  // Clicca "Verifica codice"
  const verifyButtons = await page.$$('button');
  for (const btn of verifyButtons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Verifica codice')) {
      await btn.click();
      break;
    }
  }
  // Attende lo step differito
  await waitForText(page, 'Scelta confermata', 10000);
  await wait(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '22_riacquisto_step4_conferma.png') });
  console.log('OK: 22_riacquisto_step4_conferma.png');

  await browser.close();
  console.log('\nDone! Tutti gli step riacquisto catturati.');
})();
