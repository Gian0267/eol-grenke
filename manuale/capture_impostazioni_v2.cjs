const puppeteer = require('puppeteer');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE = 'http://localhost:5173';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function clickTabByLabel(page, label) {
  // Clicca la tab usando page.evaluate per massima affidabilità
  const clicked = await page.evaluate((lbl) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.trim() === lbl);
    if (btn) { btn.click(); return true; }
    return false;
  }, label);
  if (!clicked) {
    console.warn(`  WARNING: tab "${label}" non trovata`);
  }
  return clicked;
}

async function waitForTabContent(page, uniqueText, timeout = 6000) {
  try {
    await page.waitForFunction(
      (t) => document.body.innerText.includes(t),
      { timeout },
      uniqueText
    );
  } catch {
    console.warn(`  WARNING: testo atteso "${uniqueText}" non apparso`);
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  // Login
  console.log('Login...');
  await page.goto(`${BASE}/backoffice/login`, { waitUntil: 'networkidle0' });
  await wait(1000);
  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const email = inputs.find(i => i.type === 'email' || i.name === 'email');
    const pass = inputs.find(i => i.type === 'password');
    if (email) { email.value = 'backoffice@nsm.it'; email.dispatchEvent(new Event('input', { bubbles: true })); }
    if (pass) { pass.value = 'test1234'; pass.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await wait(500);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('acced'));
    if (btn) btn.click();
  });
  await wait(3500);
  console.log('URL dopo login:', page.url());

  // Naviga alle impostazioni
  await page.goto(`${BASE}/backoffice/impostazioni`, { waitUntil: 'networkidle0' });
  await wait(2000);
  console.log('URL impostazioni:', page.url());

  // Verifica che la pagina sia caricata
  const pageText = await page.evaluate(() => document.body.innerText.substring(0, 200));
  console.log('Contenuto pagina:', pageText);

  // ── TAB 1: TIMELINE (già attiva di default) ──
  console.log('\nTab 1: Timeline...');
  await waitForTabContent(page, 'Timeline operativa');
  await wait(800);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'admin_01_timeline.png') });
  console.log('OK: admin_01_timeline.png');

  // ── TAB 2: PRICING ──
  console.log('\nTab 2: Pricing...');
  await clickTabByLabel(page, 'Pricing');
  await waitForTabContent(page, 'Calcolo live');
  await wait(800);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'admin_02_pricing.png') });
  console.log('OK: admin_02_pricing.png');

  // ── TAB 3: EMAIL ──
  console.log('\nTab 3: Email...');
  await clickTabByLabel(page, 'Email');
  await waitForTabContent(page, 'Template email');
  await wait(800);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'admin_03_email.png') });
  console.log('OK: admin_03_email.png');

  // ── TAB 4: AREA CLIENTE ──
  console.log('\nTab 4: Area Cliente...');
  await clickTabByLabel(page, 'Area Cliente');
  await waitForTabContent(page, 'Testi area cliente');
  await wait(800);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'admin_04_area_cliente.png') });
  console.log('OK: admin_04_area_cliente.png');

  // ── TAB 5: RECAPITI ──
  console.log('\nTab 5: Recapiti...');
  await clickTabByLabel(page, 'Recapiti');
  await waitForTabContent(page, 'Recapiti aziendali');
  await wait(800);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'admin_05_recapiti.png') });
  console.log('OK: admin_05_recapiti.png');

  // ── TAB 6: FEATURE FLAGS ──
  console.log('\nTab 6: Feature Flags...');
  await clickTabByLabel(page, 'Feature Flags');
  await waitForTabContent(page, 'Feature Flags');
  await wait(800);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'admin_06_feature_flags.png') });
  console.log('OK: admin_06_feature_flags.png');

  // ── TAB 7: SCRIPT TELEFONICI ──
  console.log('\nTab 7: Script Telefonici...');
  await clickTabByLabel(page, 'Script Telefonici');
  await waitForTabContent(page, 'Script telefonici');
  await wait(800);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'admin_07_script_telefonici.png') });
  console.log('OK: admin_07_script_telefonici.png');

  await browser.close();
  console.log('\nDone!');
})();
