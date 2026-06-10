const puppeteer = require('puppeteer');
const path = require('path');

const HTML_PATH = path.join(__dirname, 'Manuale_Operativo_NSM_EOL_Grenke.html');
const PDF_PATH = path.join(__dirname, 'Manuale_Operativo_NSM_EOL_Grenke.pdf');

(async () => {
  console.log('Avvio browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  console.log('Caricamento HTML...');
  await page.goto(`file://${HTML_PATH}`, { waitUntil: 'networkidle0', timeout: 30000 });

  // Attendi che tutte le immagini siano caricate
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('img'));
    await Promise.all(
      imgs.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      })
    );
  });

  console.log('Generazione PDF...');
  await page.pdf({
    path: PDF_PATH,
    format: 'A4',
    printBackground: true,
    margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div style="font-size:8px; color:#999; width:100%; text-align:center; margin-top:5mm;">Manuale Operativo — NSM EOL Grenke — Smartcom Solutions Srl</div>',
    footerTemplate: '<div style="font-size:8px; color:#999; width:100%; text-align:center; margin-bottom:5mm;">Pagina <span class="pageNumber"></span> di <span class="totalPages"></span></div>',
  });

  await browser.close();
  console.log(`PDF generato: ${PDF_PATH}`);
})();
