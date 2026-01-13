const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const USER_FILES = [
    {
        path: '/Users/apple/Desktop/IdeaHunter/results/Property Deal Analyzer | AI-Powered Investment Analysis-1.1.pdf',
        name: 'LA Multifamily (User Test)',
        expected: {
            noi: 54556,
            capRate: 6.61,
            cashOnCash: -0.50,
            tolerance: { noi: 1000, capRate: 0.2, cashOnCash: 0.5 }
        }
    },
    {
        path: '/Users/apple/Desktop/IdeaHunter/results/Property Deal Analyzer | AI-Powered Investment Analysis-2.2.pdf',
        name: 'Campbell River (User Test)',
        // Note: User might have got the Explicit NOI ($2.3M) or the V2 Calculated ($1.9M)
        // We will check which one it matches. Both are "Valid" but Explicit is "Better".
        expected: {
            noi_explicit: 2318908,
            noi_calculated: 1937997,
            capRate: 4.07, // Calculated V2
            capRate_explicit: 4.87, // If using $2.3M NOI / $47.6M
            tolerance: { noi: 50000, capRate: 0.5, cashOnCash: 2.0 }
        }
    },
    {
        path: '/Users/apple/Desktop/IdeaHunter/results/Property Deal Analyzer | AI-Powered Investment Analysis-3.1.pdf',
        name: 'Tujunga Triplex (User Test)',
        expected: {
            noi: 67160,
            capRate: 3.05,
            cashOnCash: -18.30,
            tolerance: { noi: 2000, capRate: 0.2, cashOnCash: 1.0 }
        }
    }
];

async function extractText(filePath) {
    try {
        const data = new Uint8Array(fs.readFileSync(filePath));
        const loadingTask = pdfjsLib.getDocument({ data });
        const pdf = await loadingTask.promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map(item => item.str).join(' ');
        }
        return fullText;
    } catch (e) {
        return null;
    }
}

function parseCurrency(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/[$,]/g, ''));
}

function parsePercent(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/[%]/g, ''));
}

async function run() {
    console.log('=========================================');
    console.log('  VALIDATING USER MANUAL TEST RESULTS');
    console.log('=========================================\n');

    for (const file of USER_FILES) {
        console.log(`Analyzing: ${file.name}`);
        if (!fs.existsSync(file.path)) {
            console.error(`  ❌ File not found: ${file.path}`);
            continue;
        }

        const text = await extractText(file.path);
        if (!text) {
            console.error(`  ❌ Failed to read PDF text`);
            continue;
        }

        // Extract Metrics using Regex based on Scorecard format
        // Expected Text patterns: "NOI: $54,556", "Cap Rate: 6.61%"
        const noiMatch = text.match(/NOI:\s*(\$[\d,]+)/i);
        const capMatch = text.match(/Cap Rate:\s*([\d\.]+)%/i);
        const rentMatch = text.match(/Monthly Rent:\s*(\$[\d,]+)/i);
        // Note: Scorecard doesn't sum total expenses explicitly in text list usually, check layout.
        // It lists Taxes, Insurance.
        const taxMatch = text.match(/Annual Taxes:\s*(\$[\d,]+)/i);
        const insMatch = text.match(/Annual Insurance:\s*(\$[\d,]+)/i);

        const actualNOI = noiMatch ? parseCurrency(noiMatch[1]) : 0;
        const actualCap = capMatch ? parsePercent(capMatch[1]) : 0;

        console.log(`     Rent: ${rentMatch ? rentMatch[1] : 'N/A'}`);
        console.log(`     Taxes: ${taxMatch ? taxMatch[1] : 'N/A'}`);
        console.log(`     Insurance: ${insMatch ? insMatch[1] : 'N/A'}`);

        // Validation Logic
        let passed = true;

        // NOI Check
        if (file.name.includes('Campbell')) {
            // Special handling for Campbell (Explicit vs Calculated)
            const diffExplicit = Math.abs(actualNOI - file.expected.noi_explicit);
            const diffCalc = Math.abs(actualNOI - file.expected.noi_calculated);

            if (diffExplicit < file.expected.tolerance.noi) {
                console.log(`  ✅ NOI: ${noiMatch[1]} (Matches Broker's Explicit Value - GOLD STANDARD)`);
            } else if (diffCalc < file.expected.tolerance.noi) {
                console.log(`  ✅ NOI: ${noiMatch[1]} (Matches V2 Calculation - Valid Fallback)`);
            } else {
                console.log(`  ❌ NOI: ${noiMatch[1]}`);
                console.log(`     Expected: $${file.expected.noi_explicit.toLocaleString()} or $${file.expected.noi_calculated.toLocaleString()}`);
                passed = false;
            }
        } else {
            // Standard Check
            const diff = Math.abs(actualNOI - file.expected.noi);
            if (diff <= file.expected.tolerance.noi) {
                console.log(`  ✅ NOI: ${noiMatch[1]}`);
            } else {
                console.log(`  ❌ NOI: ${noiMatch[1]} (Expected $${file.expected.noi.toLocaleString()})`);
                passed = false;
            }
        }

        // Cap Rate Check
        const expCap = file.expected.capRate_explicit || file.expected.capRate;
        if (Math.abs(actualCap - expCap) <= file.expected.tolerance.capRate) {
            console.log(`  ✅ Cap Rate: ${capMatch[1]}%`);
        } else if (file.expected.capRate_explicit && Math.abs(actualCap - file.expected.capRate) <= file.expected.tolerance.capRate) {
            console.log(`  ✅ Cap Rate: ${capMatch[1]}% (Matches Calculated)`);
        } else {
            console.log(`  ❌ Cap Rate: ${capMatch ? capMatch[1] + '%' : 'N/A'} (Expected ~${expCap}%)`);
            passed = false;
        }

        console.log('');
    }
}

run();
