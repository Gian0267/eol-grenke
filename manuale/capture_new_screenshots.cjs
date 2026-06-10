const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE = 'http://localhost:5173';

// Tau Energia SRL — no decision yet, token valid until 2026-08-03
const TOKEN_RINNOVO = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250cmF0dG9fZW9sX2lkIjoiMDcwMmY2NjUtM2M1NS00OGU1LWFkZDYtMDI1MTlkYTdhNjIwIiwiY2xpZW50ZV9pZCI6ImM3MTY1MWU3LWM5NzctNDgwNy1hMDg0LWMwZTYzNzJiNzNlYSIsImV4cCI6MTc4NjE0MDAwMCwiaWF0IjoxNzc5MTg1NDY5fQ.46Jn1Terv-fX3q_H4RzX5uCLhL8I02fmVSMyyGworME';

// Lambda Solutions SRL — no decision yet, valid 2026-06-13
const TOKEN_CONTATTO = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250cmF0dG9fZW9sX2lkIjoiMGQ2OTcyYWUtNDk3Yy00YzY3LThjMzEtMmMyMTI3MTkxMWIzIiwiY2xpZW50ZV9pZCI6Ijk2NTEzYzgxLWY4M2MtNGI1OS1hNWI3LTc4Y2YwNmJkMjk4MyIsImV4cCI6MTc4MTM4ODAwMCwiaWF0IjoxNzc5MTg1NDY5fQ.0ygBwKBA_UCqbnKsH84YgTVes3gpbVeSPRSznola-zk';

// Psi Robotics SPA — no decision yet, valid 2026-08-28
const TOKEN_RESTITUZIONE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250cmF0dG9fZW9sX2lkIjoiMjc1MGUxMWEtNmNhMi00MzI0LWI1Y2QtMzAyOTNkZjY5ZmRkIiwiY2xpZW50ZV9pZCI6IjgzNjE1YjU5LTI5M2MtNDJiOS04YTdjLWI4ODYyMjgyYjBmYiIsImV4cCI6MTc4ODQ3MjgwMCwiaWF0IjoxNzc5MTg1NDY5fQ.NiSY9xghDUWSVG5b-1yDmcmruO0rCD5rLVc3GNzpjnM';

const SAMPLE_EXCEL = path.join(__dirname, '..', 'data-samples', 'grenke-lista-esempio.xlsx');

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox'],
  });

  // ──────────────────────────────────────────────
  // 1. IMPORT PREVIEW
  // ──────────────────────────────────────────────
  console.log('\n=== IMPORT PREVIEW ===');
  const backPage = await browser.newPage();

  // Login first
  console.log('Logging in...');
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
  console.log('Logged in. URL:', backPage.url());

  // Navigate to import
  await backPage.goto(`${BASE}/backoffice/import`, { waitUntil: 'networkidle0' });
  await wait(1000);

  // Upload the Excel file
  console.log('Uploading Excel file...');
  const fileInput = await backPage.$('input[type="file"]');
  if (fileInput) {
    await fileInput.uploadFile(SAMPLE_EXCEL);
    await wait(3000); // wait for preview API response
    console.log('File uploaded, waiting for preview...');
    await backPage.screenshot({ path: path.join(SCREENSHOTS_DIR, '03b_import_preview.png') });
    console.log('OK: 03b_import_preview.png');
  } else {
    console.log('ERROR: file input not found');
  }

  await backPage.close();

  // ──────────────────────────────────────────────
  // 2. CLIENT FLOWS (no auth needed, uses JWT)
  // ──────────────────────────────────────────────

  // 2a. FLUSSO RINNOVO — step 1 (contract renewal details)
  console.log('\n=== FLUSSO RINNOVO ===');
  const rinnovoPage = await browser.newPage();
  await rinnovoPage.goto(`${BASE}/pratica/${TOKEN_RINNOVO}/rinnovo`, { waitUntil: 'networkidle0' });
  await wait(2000);
  await rinnovoPage.screenshot({ path: path.join(SCREENSHOTS_DIR, '16_flusso_rinnovo_step1.png') });
  console.log('OK: 16_flusso_rinnovo_step1.png');
  await rinnovoPage.close();

  // 2b. FLUSSO CONTATTO — the contact request form
  console.log('\n=== FLUSSO CONTATTO ===');
  const contattoPage = await browser.newPage();
  await contattoPage.goto(`${BASE}/pratica/${TOKEN_CONTATTO}/contatto`, { waitUntil: 'networkidle0' });
  await wait(2000);
  await contattoPage.screenshot({ path: path.join(SCREENSHOTS_DIR, '17_flusso_contatto.png') });
  console.log('OK: 17_flusso_contatto.png');
  await contattoPage.close();

  // 2c. FLUSSO RESTITUZIONE — step 1 (return instructions)
  console.log('\n=== FLUSSO RESTITUZIONE ===');
  const restituzionePage = await browser.newPage();
  await restituzionePage.goto(`${BASE}/pratica/${TOKEN_RESTITUZIONE}/restituzione`, { waitUntil: 'networkidle0' });
  await wait(2000);
  await restituzionePage.screenshot({ path: path.join(SCREENSHOTS_DIR, '18_flusso_restituzione_step1.png') });
  console.log('OK: 18_flusso_restituzione_step1.png');

  // Also capture step 2 of restituzione (OTP) — click "Conferma restituzione" button
  await wait(500);
  const restButtons = await restituzionePage.$$('button');
  for (const btn of restButtons) {
    const text = await restituzionePage.evaluate(el => el.textContent, btn);
    if (text && (text.includes('Conferm') || text.includes('Prosegui') || text.includes('Avanti'))) {
      await btn.click();
      await wait(2000);
      break;
    }
  }
  await restituzionePage.screenshot({ path: path.join(SCREENSHOTS_DIR, '18b_flusso_restituzione_step2.png') });
  console.log('OK: 18b_flusso_restituzione_step2.png');
  await restituzionePage.close();

  await browser.close();
  console.log('\nDone! New screenshots saved.');
})();
