const puppeteer = require('puppeteer');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE = 'http://localhost:5173';
const BACKEND = 'http://localhost:3001';

// JWT token for client area (Delta Tech SRL)
const CLIENT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250cmF0dG9fZW9sX2lkIjoiZTE5YzVkZDItOTZlMi00MmVmLTk5YjQtNzYzNDFhYmU1ZjE0IiwiY2xpZW50ZV9pZCI6IjdjNjU4MWI2LTU1MjAtNDUwOS1hNzk2LWFiMjRiODg2NTdhMCIsImV4cCI6MTc5NDAwOTYwMCwiaWF0IjoxNzc5MTg1OTE5fQ.rRX7IaGIukfoG5xr1-D7QlKshiXGogcFHRFLNyK7MTY';

async function capture(page, name, url, opts = {}) {
  console.log(`  Capturing: ${name}...`);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
  if (opts.wait) await new Promise(r => setTimeout(r, opts.wait));
  if (opts.scroll) {
    await page.evaluate((y) => window.scrollTo(0, y), opts.scroll);
    await new Promise(r => setTimeout(r, 500));
  }
  if (opts.click) {
    await page.click(opts.click);
    await new Promise(r => setTimeout(r, 1500));
  }
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, `${name}.png`),
    fullPage: opts.fullPage || false,
  });
  console.log(`  OK: ${name}.png`);
}

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  // Set auth header for backoffice pages
  await page.setExtraHTTPHeaders({
    'x-user-id': '00000000-0000-0000-0000-000000000001',
  });

  // 1. Login page (no auth needed)
  const loginPage = await browser.newPage();
  await capture(loginPage, '01_login', `${BASE}/backoffice/login`);
  await loginPage.close();

  // 2. Dashboard
  await capture(page, '02_dashboard', `${BASE}/backoffice/dashboard`, { wait: 1000 });

  // 3. Import page (empty)
  await capture(page, '03_import_pagina', `${BASE}/backoffice/import`, { wait: 1000 });

  // 4. Lista pratiche
  await capture(page, '04_lista_pratiche', `${BASE}/backoffice/pratiche`, { wait: 1500 });

  // 5. Pratica detail - panoramica (Delta Tech)
  await capture(page, '05_pratica_panoramica', `${BASE}/backoffice/pratiche/e19c5dd2-96e2-42ef-99b4-76341abe5f14`, { wait: 1500 });

  // 6. Pratica detail - timeline
  await page.goto(`${BASE}/backoffice/pratiche/e19c5dd2-96e2-42ef-99b4-76341abe5f14`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  try {
    const tabs = await page.$$('button, a');
    for (const tab of tabs) {
      const text = await page.evaluate(el => el.textContent, tab);
      if (text && text.trim() === 'Timeline') {
        await tab.click();
        await new Promise(r => setTimeout(r, 1500));
        break;
      }
    }
  } catch(e) {}
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_pratica_timeline.png') });
  console.log('  OK: 06_pratica_timeline.png');

  // 7. Outlier page
  await capture(page, '07_outlier', `${BASE}/backoffice/outlier`, { wait: 1000 });

  // 8. Task Escalation
  await capture(page, '08_task_escalation', `${BASE}/backoffice/task-escalation`, { wait: 1000 });

  // 9. Riacquisti in attesa
  await capture(page, '09_riacquisti_attesa', `${BASE}/backoffice/riacquisti-in-attesa`, { wait: 1000 });

  // 10. Reportistica
  await capture(page, '10_reportistica', `${BASE}/backoffice/reportistica`, { wait: 2000 });

  // 11. Reportistica - scroll down for perdite + performance
  await page.goto(`${BASE}/backoffice/reportistica`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '11_reportistica_bottom.png') });
  console.log('  OK: 11_reportistica_bottom.png');

  // 12. Export Grenke
  await capture(page, '12_export_grenke', `${BASE}/backoffice/export-grenke`, { wait: 1000 });

  // --- Area Cliente (no auth header, uses JWT token) ---
  const clientPage = await browser.newPage();

  // 13. Area cliente - scelta opzioni
  await capture(clientPage, '13_area_cliente', `${BASE}/pratica/${CLIENT_TOKEN}`, { wait: 2000 });

  // 14. Mailpit
  const mailPage = await browser.newPage();
  await capture(mailPage, '14_mailpit_inbox', 'http://localhost:8025', { wait: 2000 });

  // 15. Open first email
  await mailPage.goto('http://localhost:8025', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  try {
    const firstEmail = await mailPage.$('a[href*="/view/"]');
    if (firstEmail) {
      await firstEmail.click();
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch(e) {}
  await mailPage.screenshot({ path: path.join(SCREENSHOTS_DIR, '15_email_template.png') });
  console.log('  OK: 15_email_template.png');

  await browser.close();
  console.log('\nDone! All screenshots saved to:', SCREENSHOTS_DIR);
})();
