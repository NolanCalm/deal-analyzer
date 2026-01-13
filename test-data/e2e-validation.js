
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3004/api/analyze';

// MATH ENGINE (Copied from regression-test.js)
const DEFAULT_REPAIRS_RATE = 0.02;
const DEFAULT_VACANCY_RATE = 0.05;

function calculateROI(data, options = {}) {
    const {
        vacancyRate = DEFAULT_VACANCY_RATE,
        repairsRate = DEFAULT_REPAIRS_RATE,
        loanTerms = { down: 0.20, rate: 0.075, years: 30 }
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
    const repairs = askingPrice * repairsRate;
    const totalExpenses = operatingExpenses + repairs;

    const noi = effectiveGrossIncome - totalExpenses;
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

    return {
        noi, capRate, maxOffer, cashOnCash, monthlyPayment, cashFlow,
        grossAnnual, vacancyLoss, effectiveGrossIncome,
        operatingExpenses, repairs, totalExpenses
    };
}

async function analyzeProperty(filePath) {
    console.log(`\nProcessing: ${path.basename(filePath)}...`);

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return null;
    }

    const fileBuffer = fs.readFileSync(filePath);
    // No truncation
    const base64Data = fileBuffer.toString('base64');

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: base64Data,
                mimeType: 'application/pdf',
                emailUnlocked: true
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`API Error ${response.status}: ${text}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Failed to analyze: ${error.message}`);
        return null;
    }
}

function assertClose(actual, expected, tolerance, label) {
    const diff = Math.abs(actual - expected);
    const passed = diff <= tolerance;
    console.log(`  ${passed ? '✅' : '❌'} ${label}: Expected ${expected}, Got ${actual.toFixed(2)} (Diff: ${diff.toFixed(2)})`);
    return passed;
}

async function runValidation() {
    console.log('Starting End-to-End Validation with Real PDFs...');
    console.log(`Target API: ${API_URL}`);

    const testCases = [
        {
            file: 'flyer-1-la-multifamily.pdf',
            expected: {
                noi: 45148,
                capRate: 5.47,
                cashOnCash: -6.20,
                tolerances: { noi: 2000, capRate: 0.5, cashOnCash: 1.0 }
            }
        },
        {
            file: 'flyer-2-cbre-portfolio.pdf',
            expected: {
                noi: 1258000,
                capRate: 2.64,
                cashOnCash: -20.35,
                tolerances: { noi: 50000, capRate: 0.5, cashOnCash: 1.0 }
            }
        },
        {
            file: 'apperson-st-offering-memo.pdf',
            expected: {
                noi: 31800,
                capRate: 1.45,
                cashOnCash: -26.34,
                tolerances: { noi: 2000, capRate: 0.5, cashOnCash: 1.0 }
            }
        }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of testCases) {
        const filePath = path.join(__dirname, test.file);
        const apiResponse = await analyzeProperty(filePath);

        if (apiResponse && apiResponse.success && apiResponse.data) {
            console.log('  ✅ API Extraction Successful');
            // Check estimates
            if (apiResponse.estimates && apiResponse.estimates.length > 0) {
                console.log(`  ℹ️  Estimated Fields: ${apiResponse.estimates.join(', ')}`);
            }

            const mathResults = calculateROI(apiResponse.data);

            let casePassed = true;
            console.log(`  Calculated Results: NOI=$${mathResults.noi.toFixed(0)}, Cap=${mathResults.capRate.toFixed(2)}%`);

            // Validate NOI
            if (!assertClose(mathResults.noi, test.expected.noi, test.expected.tolerances.noi, 'NOI')) casePassed = false;

            // Validate Cap Rate
            if (!assertClose(mathResults.capRate, test.expected.capRate, test.expected.tolerances.capRate, 'Cap Rate')) casePassed = false;

            // Validate Cash on Cash
            if (!assertClose(mathResults.cashOnCash, test.expected.cashOnCash, test.expected.tolerances.cashOnCash, 'Cash on Cash')) casePassed = false;

            if (casePassed) passed++; else failed++;
        } else {
            console.error('  ❌ No results returned or extraction failed.');
            console.error('  Error:', apiResponse ? apiResponse.error : 'Network Error');
            if (apiResponse && apiResponse.error) console.error('  Details:', apiResponse.error);
            failed++;
        }
    }

    console.log(`\nValidation Complete. Passed: ${passed}, Failed: ${failed}`);
    if (failed > 0) process.exit(1);
}

runValidation();
