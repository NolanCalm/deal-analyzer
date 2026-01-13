
const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function debugUnits() {
    const dataBuffer = fs.readFileSync('test-data/flyer-2-cbre-portfolio.pdf');
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(dataBuffer) });
    const pdfDocument = await loadingTask.promise;

    console.log(`PDF Loaded. Pages: ${pdfDocument.numPages}`);

    let fullText = '';
    for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');

        // Normalize text roughly like frontend
        const normalized = pageText.replace(/\s+/g, ' ').trim();

        console.log(`\n--- Page ${i} ---`);
        console.log(normalized.substring(0, 200) + "..."); // Print start of page to verify

        // Grep for '121' or 'Units'
        if (normalized.includes('121')) {
            console.log(`[FOUND "121"] on Page ${i}`);
        }
        if (normalized.toLowerCase().includes('unit')) {
            console.log(`[FOUND "Unit"] on Page ${i}`);
        }

        fullText += normalized + "\n";
    }
}

debugUnits().catch(console.error);
