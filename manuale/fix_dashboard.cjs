const puppeteer = require('puppeteer');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE = 'http://localhost:5173';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  // Login first
  console.log('Logging in...');
  await page.goto(`${BASE}/backoffice/login`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  // Fill login form
  const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email"], input[placeholder*="Email"]');
  if (emailInput) {
    await emailInput.click({ clickCount: 3 });
    await emailInput.type('backoffice@nsm.it');
  }
  const passInput = await page.$('input[type="password"]');
  if (passInput) {
    await passInput.click({ clickCount: 3 });
    await passInput.type('test1234');
  }

  // Click login button
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.trim().toLowerCase().includes('acced')) {
      await btn.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 3000));
  console.log('Logged in. Current URL:', page.url());

  // Dashboard
  console.log('Capturing dashboard...');
  await page.goto(`${BASE}/backoffice/dashboard`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_dashboard.png') });
  console.log('OK: 02_dashboard.png');

  // Also recapture pages that need auth
  const pages = [
    ['03_import_pagina', '/backoffice/import'],
    ['04_lista_pratiche', '/backoffice/pratiche'],
    ['05_pratica_panoramica', '/backoffice/pratiche/e19c5dd2-96e2-42ef-99b4-76341abe5f14'],
    ['07_outlier', '/backoffice/outlier'],
    ['08_task_escalation', '/backoffice/task-escalation'],
    ['09_riacquisti_attesa', '/backoffice/riacquisti-in-attesa'],
    ['10_reportistica', '/backoffice/reportistica'],
    ['12_export_grenke', '/backoffice/export-grenke'],
  ];

  for (const [name, route] of pages) {
    console.log(`Capturing ${name}...`);
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`) });
    console.log(`OK: ${name}.png`);
  }

  // Timeline tab
  console.log('Capturing timeline...');
  await page.goto(`${BASE}/backoffice/pratiche/e19c5dd2-96e2-42ef-99b4-76341abe5f14`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  const tabs = await page.$$('button, a');
  for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text && text.trim() === 'Timeline') {
      await tab.click();
      await new Promise(r => setTimeout(r, 1500));
      break;
    }
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_pratica_timeline.png') });
  console.log('OK: 06_pratica_timeline.png');

  // Reportistica bottom
  console.log('Capturing reportistica bottom...');
  await page.goto(`${BASE}/backoffice/reportistica`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '11_reportistica_bottom.png') });
  console.log('OK: 11_reportistica_bottom.png');

  await browser.close();
  console.log('\nDone! All screenshots updated.');
})();
