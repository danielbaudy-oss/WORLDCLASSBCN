const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function main() {
  const data = new Uint8Array(fs.readFileSync('BOE-A-2025-14198.pdf'));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  console.log('Pages:', doc.numPages);
  
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n\n';
  }
  
  console.log('Total chars:', fullText.length);
  fs.writeFileSync('convenio-text.txt', fullText, 'utf8');
  console.log('Saved full text to convenio-text.txt');
  console.log('\n--- First 3000 chars ---\n');
  console.log(fullText.substring(0, 3000));
}

main().catch(e => console.error(e));
