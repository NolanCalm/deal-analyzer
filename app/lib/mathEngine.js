/**
 * mathEngine.js - Property Deal Analyzer
 * Senior Math Engine for Real Estate Investment Analysis
 */

// Constants
const DEFAULT_REPAIRS_RATE = 0.02;  // 2% of purchase price annually
const DEFAULT_VACANCY_RATE = 0.05; // 5% vacancy factor

/**
 * Calculate all investment metrics for a property
 * @param {Object} data - Property data
 * @param {Object} options - Calculation options
 * @returns {Object} Investment metrics
 */
export function calculateROI(data, options = {}) {
    const {
        vacancyRate = DEFAULT_VACANCY_RATE,
        repairsRate = DEFAULT_REPAIRS_RATE,
        loanTerms = { down: 0.20, rate: 0.075, years: 30 }
    } = options;

    // Ensure numeric values
    const askingPrice = Number(data.askingPrice) || 0;
    const grossRent = Number(data.grossRent) || 0;
    const propertyTaxes = Number(data.propertyTaxes) || 0;
    const insurance = Number(data.insurance) || 0;
    const utilities = Number(data.utilities) || 0;

    // Income Calculations
    const grossAnnual = grossRent * 12;
    const vacancyLoss = grossAnnual * vacancyRate;
    const effectiveGrossIncome = grossAnnual - vacancyLoss;

    // Expense Calculations
    const operatingExpenses = propertyTaxes + insurance + utilities;
    const repairs = askingPrice * repairsRate;
    const totalExpenses = operatingExpenses + repairs;

    // Net Operating Income
    const noi = effectiveGrossIncome - totalExpenses;

    // Cap Rate (All-Cash Analysis)
    const capRate = askingPrice > 0 ? (noi / askingPrice) * 100 : 0;

    // Max Offer at 7% Target Cap
    const maxOffer = noi > 0 ? noi / 0.07 : 0;

    // Financed Analysis (Cash-on-Cash Return)
    const downPayment = askingPrice * loanTerms.down;
    const loanAmount = askingPrice * (1 - loanTerms.down);

    // Monthly Mortgage Payment (Amortization Formula)
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
        // Income
        grossAnnual,
        vacancyLoss,
        effectiveGrossIncome,

        // Expenses
        operatingExpenses,
        repairs,
        totalExpenses,

        // Key Metrics
        noi,
        capRate,
        maxOffer,

        // Financed Metrics
        downPayment,
        loanAmount,
        monthlyPayment,
        annualDebtService,
        cashFlow,
        cashOnCash,

        // Analysis
        dealVerdict: getDealVerdict(capRate, cashOnCash)
    };
}

/**
 * Get a human-readable deal verdict
 */
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

/**
 * Format currency for display
 */
export function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

/**
 * Format percentage for display
 */
export function formatPercent(value) {
    return `${value.toFixed(2)}%`;
}
