/**
 * REGRESSION TEST SUITE - Property Deal Analyzer MVP
 * Validates: Math Engine, Backend API, Rate Limiting, Input Validation
 * 
 * Run with: node test-data/regression-test.js
 * Requires: Vercel dev server running on localhost:3001
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// TEST CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const API_URL = 'http://localhost:3001/api/analyze';
const TEST_DATA_DIR = path.join(__dirname);

// Test counters
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// ═══════════════════════════════════════════════════════════════
// MATH ENGINE (Copied from production code)
// ═══════════════════════════════════════════════════════════════

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

function getDealVerdict(capRate, cashOnCash) {
    if (capRate >= 8 && cashOnCash >= 10) {
        return { rating: 'excellent', emoji: '🟢', text: 'Strong Buy' };
    } else if (capRate >= 6 && cashOnCash >= 5) {
        return { rating: 'good', emoji: '🟡', text: 'Worth Negotiating' };
    } else if (capRate >= 4) {
        return { rating: 'fair', emoji: '🟠', text: 'Below Market - Negotiate Hard' };
    } else {
        return { rating: 'poor', emoji: '🔴', text: 'Walk Away' };
    }
}

// ═══════════════════════════════════════════════════════════════
// TEST UTILITIES
// ═══════════════════════════════════════════════════════════════

function assert(condition, testName, expected, actual) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✅ ${testName}`);
        return true;
    } else {
        failedTests++;
        console.log(`  ❌ ${testName}`);
        if (expected !== undefined) {
            console.log(`     Expected: ${expected}`);
            console.log(`     Actual:   ${actual}`);
        }
        return false;
    }
}

function assertClose(actual, expected, tolerance, testName) {
    const diff = Math.abs(actual - expected);
    return assert(
        diff <= tolerance,
        testName,
        `${expected} (±${tolerance})`,
        actual
    );
}

function formatCurrency(v) {
    return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPercent(v) {
    return v.toFixed(2) + '%';
}

// ═══════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════

const testProperties = [
    {
        name: "LA Multifamily (5 units)",
        source: "flyer-1-la-multifamily.pdf",
        data: {
            address: "483 E 49th St, Los Angeles, CA 90011",
            units: 5,
            askingPrice: 825000,
            grossRent: 7388,
            propertyTaxes: 9900,
            insurance: 7675,
            utilities: 5000
        },
        expected: {
            noi: { value: 45148, tolerance: 100 },
            capRate: { value: 5.47, tolerance: 0.1 },
            cashOnCash: { value: -6.20, tolerance: 0.5 },
            verdict: 'fair'
        }
    },
    {
        name: "Campbell River Portfolio (122 units)",
        source: "flyer-2-cbre-portfolio.pdf",
        data: {
            address: "2036 & 2338 South Island Highway, Campbell River, BC",
            units: 122,
            askingPrice: 47600000,
            grossRent: 283333,
            propertyTaxes: 400000,
            insurance: 122000,
            utilities: 498000
        },
        expected: {
            noi: { value: 1258000, tolerance: 10000 },
            capRate: { value: 2.64, tolerance: 0.1 },
            cashOnCash: { value: -20.35, tolerance: 1.0 },
            verdict: 'poor'
        }
    },
    {
        name: "Tujunga Triplex (3 units)",
        source: "apperson-st-offering-memo.pdf",
        data: {
            address: "7502 Apperson St, Tujunga, CA 91042",
            units: 3,
            askingPrice: 2200000,
            grossRent: 9000,
            propertyTaxes: 22000,
            insurance: 4800,
            utilities: 0
        },
        expected: {
            noi: { value: 31800, tolerance: 100 },
            capRate: { value: 1.45, tolerance: 0.1 },
            cashOnCash: { value: -26.34, tolerance: 1.0 },
            verdict: 'poor'
        }
    }
];

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 1: MATH ENGINE VALIDATION
// ═══════════════════════════════════════════════════════════════

async function testMathEngine() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              TEST SUITE 1: MATH ENGINE VALIDATION           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    for (const test of testProperties) {
        console.log(`\n📋 Testing: ${test.name}`);
        console.log(`   Source: ${test.source}`);

        const result = calculateROI(test.data);
        const verdict = getDealVerdict(result.capRate, result.cashOnCash);

        // Test NOI calculation
        assertClose(
            result.noi,
            test.expected.noi.value,
            test.expected.noi.tolerance,
            `NOI = ${formatCurrency(result.noi)}`
        );

        // Test Cap Rate
        assertClose(
            result.capRate,
            test.expected.capRate.value,
            test.expected.capRate.tolerance,
            `Cap Rate = ${formatPercent(result.capRate)}`
        );

        // Test Cash-on-Cash
        assertClose(
            result.cashOnCash,
            test.expected.cashOnCash.value,
            test.expected.cashOnCash.tolerance,
            `Cash-on-Cash = ${formatPercent(result.cashOnCash)}`
        );

        // Test Verdict
        assert(
            verdict.rating === test.expected.verdict,
            `Verdict = ${verdict.text}`,
            test.expected.verdict,
            verdict.rating
        );

        // Test Max Offer calculation
        const expectedMaxOffer = result.noi / 0.07;
        assertClose(
            result.maxOffer,
            expectedMaxOffer,
            100,
            `Max Offer = ${formatCurrency(result.maxOffer)}`
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 2: BACKEND API VALIDATION
// ═══════════════════════════════════════════════════════════════

async function testBackendAPI() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║            TEST SUITE 2: BACKEND API VALIDATION             ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // Check server availability first
    console.log('📋 Checking server availability...');
    try {
        const healthCheck = await fetch(API_URL, { method: 'GET' });
        // Server responded (even with 405) - it's available
    } catch (error) {
        console.log('   ⚠️  Server not reachable - skipping backend API tests');
        console.log('   💡 Start server with: npx vercel dev --listen 3000');
        return; // Skip all backend tests
    }

    // Test 1: Invalid Method (GET instead of POST)
    console.log('\n📋 Test: Invalid HTTP Method');
    try {
        const response = await fetch(API_URL, { method: 'GET' });
        assert(
            response.status === 405,
            'Rejects GET requests with 405',
            405,
            response.status
        );
    } catch (error) {
        assert(false, 'API should be reachable', 'Response', error.message);
    }

    // Test 2: Missing required fields
    console.log('\n📋 Test: Missing Required Fields');
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await response.json();
        assert(
            response.status === 400,
            'Rejects missing fields with 400',
            400,
            response.status
        );
        assert(
            data.error && data.error.includes('Missing'),
            'Error message mentions missing data',
            'Missing image data',
            data.error
        );
    } catch (error) {
        assert(false, 'Should handle missing fields', 'Error response', error.message);
    }

    // Test 3: Invalid MIME type
    console.log('\n📋 Test: Invalid MIME Type');
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: 'base64data',
                mimeType: 'application/exe'
            })
        });
        const data = await response.json();
        assert(
            response.status === 400,
            'Rejects invalid MIME type with 400',
            400,
            response.status
        );
        assert(
            data.error && data.error.includes('Unsupported'),
            'Error message mentions unsupported type',
            'Unsupported file type',
            data.error
        );
    } catch (error) {
        assert(false, 'Should handle invalid MIME type', 'Error response', error.message);
    }

    // Test 4: Payload too large
    console.log('\n📋 Test: Payload Size Limit');
    try {
        const largePayload = 'A'.repeat(6 * 1024 * 1024); // 6MB
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: largePayload,
                mimeType: 'image/jpeg'
            })
        });
        const data = await response.json();
        assert(
            response.status === 413,
            'Rejects large payload with 413',
            413,
            response.status
        );
    } catch (error) {
        assert(false, 'Should handle large payload', 'Error response', error.message);
    }

    // Test 5: Valid request (using small test image)
    console.log('\n📋 Test: Valid Request');
    try {
        // 1x1 transparent PNG (base64)
        const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: testImage,
                mimeType: 'image/png',
                emailUnlocked: false
            })
        });

        // Note: This will likely fail extraction (blank image), but should return 200
        // and proper structure
        const data = await response.json();

        if (response.status === 200) {
            assert(
                data.hasOwnProperty('success'),
                'Response has success field',
                'success property',
                Object.keys(data).join(', ')
            );
            assert(
                data.hasOwnProperty('remaining'),
                'Response has remaining field (rate limit)',
                'remaining property',
                Object.keys(data).join(', ')
            );
            assert(
                data.hasOwnProperty('limit'),
                'Response has limit field',
                'limit property',
                Object.keys(data).join(', ')
            );
        } else if (response.status === 500) {
            // Extraction might fail on blank image - that's OK for this test
            assert(
                data.error !== undefined,
                'Error response has error field',
                'error field',
                Object.keys(data).join(', ')
            );
        } else {
            assert(false, 'Unexpected response status', '200 or 500', response.status);
        }
    } catch (error) {
        assert(false, 'Should handle valid request', 'Response', error.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 3: RATE LIMITING
// ═══════════════════════════════════════════════════════════════

async function testRateLimiting() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              TEST SUITE 3: RATE LIMITING                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // Check server availability
    try {
        await fetch(API_URL, { method: 'GET' });
    } catch (error) {
        console.log('   ⚠️  Server not reachable - skipping rate limiting tests');
        return;
    }

    console.log('📋 Test: Rate Limit Headers');
    console.log('   ⚠️  Note: Rate limiting uses in-memory storage (resets on server restart)');

    try {
        const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: testImage,
                mimeType: 'image/png',
                emailUnlocked: false
            })
        });

        // Check rate limit headers
        const remaining = response.headers.get('X-Daily-Remaining');
        const limit = response.headers.get('X-Daily-Limit');
        const needsEmail = response.headers.get('X-Needs-Email');

        assert(
            remaining !== null,
            'Response includes X-Daily-Remaining header',
            'header present',
            remaining || 'null'
        );
        assert(
            limit !== null,
            'Response includes X-Daily-Limit header',
            'header present',
            limit || 'null'
        );
        assert(
            needsEmail !== null,
            'Response includes X-Needs-Email header',
            'header present',
            needsEmail || 'null'
        );

        if (remaining !== null && limit !== null) {
            console.log(`   📊 Current usage: ${remaining}/${limit} remaining`);
        }
    } catch (error) {
        assert(false, 'Should return rate limit headers', 'Headers', error.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 4: STRESS TEST TOGGLE
// ═══════════════════════════════════════════════════════════════

async function testStressMode() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║            TEST SUITE 4: STRESS TEST TOGGLE                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const testData = testProperties[0].data; // Use LA Multifamily

    console.log('📋 Test: Normal vs Stress Test Mode');

    // Normal mode (5% vacancy)
    const normalResult = calculateROI(testData, { vacancyRate: 0.05 });

    // Stress mode (10% vacancy)
    const stressResult = calculateROI(testData, { vacancyRate: 0.10 });

    // Stress mode should have lower NOI
    assert(
        stressResult.noi < normalResult.noi,
        'Stress mode reduces NOI',
        `< ${formatCurrency(normalResult.noi)}`,
        formatCurrency(stressResult.noi)
    );

    // Stress mode should have lower cap rate
    assert(
        stressResult.capRate < normalResult.capRate,
        'Stress mode reduces Cap Rate',
        `< ${formatPercent(normalResult.capRate)}`,
        formatPercent(stressResult.capRate)
    );

    // Vacancy loss should double
    const expectedStressVacancy = normalResult.vacancyLoss * 2;
    assertClose(
        stressResult.vacancyLoss,
        expectedStressVacancy,
        10,
        'Vacancy loss doubles in stress mode',
    );

    console.log(`   📊 Normal Mode:  NOI=${formatCurrency(normalResult.noi)}, Cap=${formatPercent(normalResult.capRate)}`);
    console.log(`   📊 Stress Mode:  NOI=${formatCurrency(stressResult.noi)}, Cap=${formatPercent(stressResult.capRate)}`);
}

// ═══════════════════════════════════════════════════════════════
// MAIN TEST RUNNER
// ═══════════════════════════════════════════════════════════════

async function runAllTests() {
    console.log('\n');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('   PROPERTY DEAL ANALYZER - REGRESSION TEST SUITE');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`   Started: ${new Date().toLocaleString()}`);
    console.log('════════════════════════════════════════════════════════════════');

    try {
        // Suite 1: Math Engine
        await testMathEngine();

        // Suite 2: Backend API
        await testBackendAPI();

        // Suite 3: Rate Limiting
        await testRateLimiting();

        // Suite 4: Stress Test
        await testStressMode();

    } catch (error) {
        console.error('\n❌ FATAL ERROR:', error);
        failedTests++;
    }

    // Print summary
    console.log('\n');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('                      TEST SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`   Total Tests:   ${totalTests}`);
    console.log(`   ✅ Passed:     ${passedTests}`);
    console.log(`   ❌ Failed:     ${failedTests}`);
    console.log(`   Success Rate:  ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`   Completed: ${new Date().toLocaleString()}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    // Exit with error code if any tests failed
    process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests
runAllTests();
