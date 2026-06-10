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

  // Login
  console.log('Logging in...');
  await page.goto(`${BASE}/backoffice/login`, { waitUntil: 'networkidle0' });
  await wait(800);
  const emailInput = await page.$('input[type="email"], input[name="email"]');
  if (emailInput) { await emailInput.click({ clickCount: 3 }); await emailInput.type('backoffice@nsm.it'); }
  const passInput = await page.$('input[type="password"]');
  if (passInput) { await passInput.click({ clickCount: 3 }); await passInput.type('test1234'); }
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.trim().toLowerCase().includes('acced')) { await btn.click(); break; }
  }
  await wait(3000);
  console.log('Logged in. URL:', page.url());

  // Navigate to settings
  await page.goto(`${BASE}/backoffice/impostazioni`, { waitUntil: 'networkidle0' });
  await wait(2000);

  const TABS = [
    { label: 'Timeline',         file: 'admin_01_timeline.png' },
    { label: 'Pricing',          file: 'admin_02_pricing.png' },
    { label: 'Email',            file: 'admin_03_email.png' },
    { label: 'Area Cliente',     file: 'admin_04_area_cliente.png' },
    { label: 'Recapiti',         file: 'admin_05_recapiti.png' },
    { label: 'Feature Flags',    file: 'admin_06_feature_flags.png' },
    { label: 'Script Telefonici',file: 'admin_07_script_telefonici.png' },
  ];

  for (const tab of TABS) {
    console.log(`Capturing tab: ${tab.label}...`);

    // Click the tab
    const allButtons = await page.$$('button');
    for (const btn of allButtons) {
      const text = await page.evaluate(el => el.textContent.trim(), btn);
      if (text === tab.label) {
        await btn.click();
        await wait(1200);
        break;
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, tab.file) });
    console.log(`OK: ${tab.file}`);
  }

  await browser.close();
  console.log('\nDone! Tutte le tab impostazioni catturate.');
})();
