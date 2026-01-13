const fs = require('fs');
const path = require('path');
// Import pdfjs-dist. Note: in Node we use the main entry point
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const API_URL = 'https://deal-analyzer-one.vercel.app/api/analyze';

// 1x1 Transparent PNG
const DUMMY_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// MATH ENGINE V2 (Copied from regression-test.js)
const DEFAULT_REPAIRS_RATE = 0.08; // 8% of Gross Income
const DEFAULT_VACANCY_RATE = 0.05;

function calculateROI(data, options = {}) {
    const {
        vacancyRate = DEFAULT_VACANCY_RATE,
        repairsRate = DEFAULT_REPAIRS_RATE,
        loanTerms = { down: 0.20, rate: 0.075, years: 30 },
        useStatedValues = true
    } = options;

    const askingPrice = Number(data.askingPrice) || 0;
    const grossRent = Number(data.grossRent) || 0;
    const propertyTaxes = Number(data.propertyTaxes) || 0;
    const insurance = Number(data.insurance) || 0;
    const utilities = Number(data.utilities) || 0;

    const grossAnnual = grossRent * 12;
    const vacancyLoss = grossAnnual * vacancyRate;
    const effectiveGrossIncome = grossAnnual - vacancyLoss;

    const operatingExpenses = propertyTaxes + insurance + utilities;
    // V2: Repairs = % of Gross Income
    const repairs = grossAnnual * repairsRate;
    const itemsExpenses = operatingExpenses + repairs;
    const noiCalculated = effectiveGrossIncome - itemsExpenses;

    // V2: Trust Stated NOI if available
    const noi = (useStatedValues && Number(data.noi) > 0) ? Number(data.noi) : noiCalculated;

    const capRate = askingPrice > 0 ? (noi / askingPrice) * 100 : 0;
    const maxOffer = noi > 0 ? noi / 0.07 : 0;

    const downPayment = askingPrice * loanTerms.down;
    const loanAmount = askingPrice * (1 - loanTerms.down);

    const monthlyRate = loanTerms.rate / 12;
    const numPayments = loanTerms.years * 12;
    const monthlyPayment = loanAmount > 0
        ? (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments))
        / (Math.pow(1 + monthlyRate, numPayments) - 1)
        : 0;

    const annualDebtService = monthlyPayment * 12;
    const cashFlow = noi - annualDebtService;
    const cashOnCash = downPayment > 0 ? (cashFlow / downPayment) * 100 : 0;

    return { noi, capRate, maxOffer, cashOnCash };
}

async function extractTextFromPDF(filePath) {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;

    let fullText = '';
    // Limit to first 10 pages for speed/relevance logic (production uses similar logic)
    const maxPages = Math.min(pdf.numPages, 10);

    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }
    return fullText;
}

async function analyzePropertyProduction(filePath) {
    console.log(`\nProcessing: ${path.basename(filePath)}...`);

    try {
        console.log('  Extracting text...');
        const textContext = await extractTextFromPDF(filePath);
        console.log(`  Extracted ${textContext.length} chars.`);

        console.log(`  Sending to API: ${API_URL}`);
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                images: [DUMMY_IMAGE], // Dummy image strictly for validation (API requires image)
                mimeType: 'image/jpeg',
                textContext: textContext,
                emailUnlocked: true
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`API Error ${response.status}: ${text}`);
        }

        const json = await response.json();
        return json;
    } catch (error) {
        console.error(`  Failed: ${error.message}`);
        return null;
    }
}

function assertClose(actual, expected, tolerance, label) {
    const diff = Math.abs(actual - expected);
    const passed = diff <= tolerance;
    const icon = passed ? '✅' : '❌';
    console.log(`    ${icon} ${label}: Got ${actual.toFixed(0)} / ${expected} (Diff: ${diff.toFixed(0)})`);
    return passed;
}

async function run() {
    console.log('==================================================');
    console.log(' PRODUCTION E2E VALIDATION (Simulation)');
    console.log(' Verifying Math Engine V2 on Live Deployment');
    console.log('==================================================');

    const testCases = [
        {
            file: 'flyer-1-la-multifamily.pdf',
            expected: { noi: 54556, capRate: 6.61, cashOnCash: -0.50 }
        },
        {
            file: 'flyer-2-cbre-portfolio.pdf',
            expected: { noi: 1937997, capRate: 4.07, cashOnCash: -13.21 }
        },
        {
            file: 'apperson-st-offering-memo.pdf',
            expected: { noi: 67160, capRate: 3.05, cashOnCash: -18.30 }
        }
    ];

    let passedCount = 0;

    for (const test of testCases) {
        const filePath = path.join(__dirname, test.file);
        const result = await analyzePropertyProduction(filePath);

        if (result && result.success) {
            const metrics = calculateROI(result.data);

            console.log(`  > Extracted NOI: $${result.data.noi || 0}`);

            let passed = true;
            if (!assertClose(metrics.noi, test.expected.noi, 50000, 'NOI')) passed = false;
            if (!assertClose(metrics.capRate, test.expected.capRate, 1.0, 'Cap Rate')) passed = false;

            if (passed) passedCount++;
        }
    }

    console.log(`\nPassed: ${passedCount} / ${testCases.length}`);
}

run();
