const puppeteer = require('puppeteer');
const path = require('path');

const HTML_PATH = path.join(__dirname, 'procedura_backoffice.html');
const PDF_PATH = path.join(__dirname, 'Procedura_Backoffice_EOL_Grenke.pdf');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`file://${HTML_PATH}`, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: PDF_PATH,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%;font-size:8pt;color:#9ca3af;padding:0 16mm;display:flex;justify-content:space-between;">' +
      '<span>Procedura operativa backoffice — Fine noleggio Grenke FLEX</span>' +
      '<span class="pageNumber"></span></div>',
    margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
  });
  console.log(`PDF: ${PDF_PATH}`);
  await browser.close();
})();
