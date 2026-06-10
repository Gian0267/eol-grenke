const puppeteer = require('puppeteer');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250cmF0dG9fZW9sX2lkIjoiZWM5ZjRhMDMtOGU3MC00MjdhLTgzNDUtYzgzMTgyYjUyNmI2IiwiY2xpZW50ZV9pZCI6IjUzYzdmNDcxLWRhMDctNGE2NS04NGFkLTlhMjJiODZmMDUwNiIsImV4cCI6MTc4NDMyNTYwMCwiaWF0IjoxNzc5MTg1NDY4fQ.388yE24By9c_VJXI8kd5q44YELMb7uo5Rg5ds1-7YcM';
const BASE = 'http://localhost:5173';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 480, height: 900 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  // Step 1 — Scelta beni (initial state)
  await page.goto(`${BASE}/pratica/${TOKEN}/rinnovo`, { waitUntil: 'networkidle0' });
  await wait(2000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16a_rinnovo_step1_scelta_beni.png'), fullPage: true });
  console.log('OK: 16a_rinnovo_step1_scelta_beni.png');

  // Step 1 — Select "Li tengo"
  const cards = await page.$$('[class*="cursor-pointer"][class*="border-2"][class*="rounded-xl"]');
  if (cards.length >= 1) {
    await cards[0].click();
    await wait(500);
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16b_rinnovo_step1_tengo_selected.png'), fullPage: true });
  console.log('OK: 16b_rinnovo_step1_tengo_selected.png');

  // Step 1 — Select "Li restituisco" to show instructions
  if (cards.length >= 2) {
    await cards[1].click();
    await wait(500);
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16c_rinnovo_step1_restituisco.png'), fullPage: true });
  console.log('OK: 16c_rinnovo_step1_restituisco.png');

  // Go back to "Li tengo" and proceed to step 2
  if (cards.length >= 1) {
    await cards[0].click();
    await wait(300);
  }
  // Click "Procedi al rinnovo"
  const procediBtn = await page.$('button:not([disabled])');
  const allBtns = await page.$$('button');
  for (const btn of allBtns) {
    const text = await page.evaluate(el => el.textContent.trim(), btn);
    if (text.includes('Procedi al rinnovo')) {
      await btn.click();
      break;
    }
  }
  await wait(1000);

  // Step 2 — Preferenze rinnovo
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16d_rinnovo_step2_preferenze.png'), fullPage: true });
  console.log('OK: 16d_rinnovo_step2_preferenze.png');

  // Click "Procedi" to go to Step 3
  const btnsStep2 = await page.$$('button');
  for (const btn of btnsStep2) {
    const text = await page.evaluate(el => el.textContent.trim(), btn);
    if (text.includes('Procedi') && !text.includes('rinnovo')) {
      await btn.click();
      break;
    }
  }
  await wait(1000);

  // Step 3 — Riepilogo + OTP selection
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16e_rinnovo_step3_riepilogo_otp.png'), fullPage: true });
  console.log('OK: 16e_rinnovo_step3_riepilogo_otp.png');

  // Click "Ricevi via Email"
  const btnsStep3 = await page.$$('button');
  for (const btn of btnsStep3) {
    const text = await page.evaluate(el => el.textContent.trim(), btn);
    if (text.includes('Ricevi via Email')) {
      await btn.click();
      break;
    }
  }
  await wait(2000);

  // Step 3 — OTP input
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16f_rinnovo_step3_otp_input.png'), fullPage: true });
  console.log('OK: 16f_rinnovo_step3_otp_input.png');

  // Enter OTP 123456
  const otpInput = await page.$('input[inputmode="numeric"]');
  if (otpInput) {
    await otpInput.click();
    await otpInput.type('123456');
    await wait(300);
  }

  // Click "Conferma rinnovo"
  const btnsOtp = await page.$$('button');
  for (const btn of btnsOtp) {
    const text = await page.evaluate(el => el.textContent.trim(), btn);
    if (text.includes('Conferma rinnovo')) {
      await btn.click();
      break;
    }
  }
  await wait(3000);

  // Step 4 — Conferma finale
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16g_rinnovo_step4_conferma.png'), fullPage: true });
  console.log('OK: 16g_rinnovo_step4_conferma.png');

  await browser.close();
  console.log('Done!');
})();
