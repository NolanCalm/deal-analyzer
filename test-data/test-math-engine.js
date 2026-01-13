/**
 * Math Engine Unit Test
 * Tests calculateROI with sample data from 3 real property flyers
 */

// Constants (from mathEngine.js)
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
        grossAnnual, vacancyLoss, effectiveGrossIncome,
        operatingExpenses, repairs, totalExpenses,
        noi, capRate, maxOffer,
        downPayment, loanAmount, monthlyPayment, annualDebtService,
        cashFlow, cashOnCash
    };
}

function formatCurrency(v) { return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function formatPercent(v) { return v.toFixed(2) + '%'; }

// ═══════════════════════════════════════════════════════════════
// TEST DATA FROM REAL PROPERTY FLYERS
// ═══════════════════════════════════════════════════════════════

const testCases = [
    {
        name: "Flyer 1: 483 E 49th St, Los Angeles (5 units)",
        source: "flyer-1-la-multifamily.pdf",
        data: {
            address: "483 E 49th St, Los Angeles, CA 90011",
            units: 5,
            askingPrice: 825000,
            grossRent: 7388,      // Monthly from OM
            propertyTaxes: 9900,  // Annual
            insurance: 7675,      // Annual
            utilities: 5000       // Annual (estimated)
        }
    },
    {
        name: "Flyer 2: Campbell River Portfolio (CBRE)",
        source: "flyer-2-cbre-portfolio.pdf",
        data: {
            address: "2036 & 2338 South Island Highway, Campbell River, BC",
            units: 122,
            askingPrice: 47600000,   // Real value from PDF
            grossRent: 283333,       // Monthly (real: ~$3.4M annual / 12)
            propertyTaxes: 400000,   // Annual
            insurance: 122000,       // Annual
            utilities: 498000        // Annual
        }
    },
    {
        name: "Flyer 3: Apperson St, Tujunga (existing test)",
        source: "apperson-st-offering-memo.pdf",
        data: {
            address: "7502 Apperson St, Tujunga, CA 91042",
            units: 3,
            askingPrice: 2200000,
            grossRent: 9000,       // Monthly
            propertyTaxes: 22000,  // Annual
            insurance: 4800,       // Annual
            utilities: 0           // Tenant pays
        }
    }
];

// ═══════════════════════════════════════════════════════════════
// RUN TESTS
// ═══════════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║        MATH ENGINE VERIFICATION - 3 PROPERTY FLYERS         ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

testCases.forEach((test, i) => {
    console.log(`\n┌─────────────────────────────────────────────────────────────────┐`);
    console.log(`│ TEST ${i + 1}: ${test.name.padEnd(52)} │`);
    console.log(`│ Source: ${test.source.padEnd(53)} │`);
    console.log(`└─────────────────────────────────────────────────────────────────┘`);

    console.log('\n📥 INPUT DATA:');
    console.log(`   Address:      ${test.data.address}`);
    console.log(`   Units:        ${test.data.units}`);
    console.log(`   Asking Price: ${formatCurrency(test.data.askingPrice)}`);
    console.log(`   Monthly Rent: ${formatCurrency(test.data.grossRent)}`);
    console.log(`   Taxes:        ${formatCurrency(test.data.propertyTaxes)}/yr`);
    console.log(`   Insurance:    ${formatCurrency(test.data.insurance)}/yr`);
    console.log(`   Utilities:    ${formatCurrency(test.data.utilities)}/yr`);

    const result = calculateROI(test.data);

    console.log('\n📊 CALCULATED METRICS:');
    console.log(`   ├─ Gross Annual Income:  ${formatCurrency(result.grossAnnual)}`);
    console.log(`   ├─ Vacancy Loss (5%):    ${formatCurrency(result.vacancyLoss)}`);
    console.log(`   ├─ Effective Income:     ${formatCurrency(result.effectiveGrossIncome)}`);
    console.log(`   ├─ Operating Expenses:   ${formatCurrency(result.operatingExpenses)}`);
    console.log(`   ├─ Repairs (2%):         ${formatCurrency(result.repairs)}`);
    console.log(`   └─ Total Expenses:       ${formatCurrency(result.totalExpenses)}`);

    console.log('\n🎯 KEY INVESTMENT METRICS:');
    console.log(`   ┌──────────────────────────────────────────────────────────────┐`);
    console.log(`   │  NOI:           ${formatCurrency(result.noi).padEnd(45)} │`);
    console.log(`   │  Cap Rate:      ${formatPercent(result.capRate).padEnd(45)} │`);
    console.log(`   │  Max Offer:     ${formatCurrency(result.maxOffer).padEnd(45)} │`);
    console.log(`   │  Cash-on-Cash:  ${formatPercent(result.cashOnCash).padEnd(45)} │`);
    console.log(`   │  Monthly Mtg:   ${formatCurrency(result.monthlyPayment).padEnd(45)} │`);
    console.log(`   │  Cash Flow:     ${formatCurrency(result.cashFlow)}/yr`.padEnd(65) + '│');
    console.log(`   └──────────────────────────────────────────────────────────────┘`);

    // Verdict
    let verdict = '🔴 WALK AWAY';
    if (result.capRate >= 8 && result.cashOnCash >= 10) verdict = '🟢 STRONG BUY';
    else if (result.capRate >= 6 && result.cashOnCash >= 5) verdict = '🟡 WORTH NEGOTIATING';
    else if (result.capRate >= 4) verdict = '🟠 BELOW MARKET - NEGOTIATE';

    console.log(`\n   VERDICT: ${verdict}`);
    console.log(`   Price Gap: ${formatCurrency(test.data.askingPrice - result.maxOffer)} over max offer`);
});

console.log('\n\n════════════════════════════════════════════════════════════════');
console.log('                    ✓ ALL TESTS COMPLETED                       ');
console.log('════════════════════════════════════════════════════════════════\n');
