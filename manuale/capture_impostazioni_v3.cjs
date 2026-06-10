const puppeteer = require('puppeteer');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE = 'http://localhost:5173';

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

  // ── LOGIN (metodo nativo Puppeteer) ──
  console.log('Login...');
  await page.goto(`${BASE}/backoffice/login`, { waitUntil: 'networkidle0' });
  await wait(1000);

  const emailInput = await page.$('input[type="email"], input[name="email"]');
  if (emailInput) { await emailInput.click({ clickCount: 3 }); await emailInput.type('admin@nsm.it'); }
  const passInput = await page.$('input[type="password"]');
  if (passInput) { await passInput.click({ clickCount: 3 }); await passInput.type('test1234'); }

  const loginButtons = await page.$$('button');
  for (const btn of loginButtons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.trim().toLowerCase().includes('acced')) { await btn.click(); break; }
  }
  await wait(3500);
  console.log('URL dopo login:', page.url());

  // Se ancora sulla login, qualcosa è andato storto
  if (page.url().includes('login')) {
    console.error('Login fallito!');
    await browser.close();
    process.exit(1);
  }

  // ── NAVIGA ALLE IMPOSTAZIONI ──
  await page.goto(`${BASE}/backoffice/impostazioni`, { waitUntil: 'networkidle0' });
  await waitForText(page, 'Impostazioni');
  await wait(1500);
  console.log('Pagina impostazioni caricata');

  const TABS = [
    { label: 'Timeline',          waitFor: 'Timeline operativa',  file: 'admin_01_timeline.png' },
    { label: 'Pricing',           waitFor: 'Calcolo live',         file: 'admin_02_pricing.png' },
    { label: 'Email',             waitFor: 'Template email',       file: 'admin_03_email.png' },
    { label: 'Area Cliente',      waitFor: 'Testi area cliente',   file: 'admin_04_area_cliente.png' },
    { label: 'Recapiti',          waitFor: 'Recapiti aziendali',   file: 'admin_05_recapiti.png' },
    { label: 'Feature Flags',     waitFor: 'Feature Flags',        file: 'admin_06_feature_flags.png' },
    { label: 'Script Telefonici', waitFor: 'Script telefonici',    file: 'admin_07_script_telefonici.png' },
  ];

  for (const tab of TABS) {
    console.log(`\nTab: ${tab.label}...`);

    // Clicca la tab
    const allButtons = await page.$$('button');
    let found = false;
    for (const btn of allButtons) {
      const text = await page.evaluate(el => el.textContent.trim(), btn);
      if (text === tab.label) {
        await btn.click();
        found = true;
        break;
      }
    }
    if (!found) console.warn(`  WARN: pulsante "${tab.label}" non trovato`);

    // Attende testo specifico del tab
    try {
      await waitForText(page, tab.waitFor, 5000);
    } catch {
      console.warn(`  WARN: contenuto "${tab.waitFor}" non apparso`);
    }
    await wait(1000);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, tab.file) });
    console.log(`OK: ${tab.file}`);
  }

  await browser.close();
  console.log('\nDone!');
})();
