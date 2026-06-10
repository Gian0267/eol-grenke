const puppeteer = require('puppeteer');
const path = require('path');

const HTML_PATH = path.join(__dirname, 'flowchart_processo_eol.html');
const PDF_PATH = path.join(__dirname, 'Flowchart_Processo_EOL_Grenke.pdf');
const PNG_PATH = path.join(__dirname, 'screenshots', 'flowchart_processo_eol.png');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  await page.setViewport({ width: 1123, height: 794 }); // A4 landscape px @96dpi
  await page.goto(`file://${HTML_PATH}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  // PDF
  await page.pdf({
    path: PDF_PATH,
    landscape: true,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  console.log(`PDF: ${PDF_PATH}`);

  // PNG screenshot
  await page.screenshot({ path: PNG_PATH, fullPage: false });
  console.log(`PNG: ${PNG_PATH}`);

  await browser.close();
  console.log('Done!');
})();
