// tests/parseMoneyTest.js
// Run with: node tests/parseMoneyTest.js

/**
 * Re-implementation of the server-side parseMoney logic for testing
 * In a real repo, we would export this from a shared module.
 */
function parseMoney(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
    if (typeof value !== 'string') return 0;

    // Handle: "$1,234,567.89", "1234567", "1.2M", "$1.5B"
    let cleaned = value.replace(/[^0-9.\-KMBkmb]/g, '');

    // Handle K/M/B multipliers
    const multipliers = { k: 1e3, m: 1e6, b: 1e9 };
    const multiplierMatch = cleaned.match(/([0-9.]+)([KMBkmb])/);
    if (multiplierMatch) {
        const num = parseFloat(multiplierMatch[1]);
        const mult = multipliers[multiplierMatch[2].toLowerCase()];
        return Number.isFinite(num) ? Math.max(0, num * mult) : 0;
    }

    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? Math.max(0, num) : 0;
}

const testCases = [
    { input: '$1,234,567', expected: 1234567, name: 'Standard currency' },
    { input: '1234567.89', expected: 1234567.89, name: 'Decimal number' },
    { input: '-$500', expected: 0, name: 'Negative value (clamped)' },
    { input: '1.5M', expected: 1500000, name: 'Millions suffix' },
    { input: '2.5B', expected: 2500000000, name: 'Billions suffix' },
    { input: '$100k', expected: 100000, name: 'Thousands suffix (lowercase)' },
    { input: 'Not a number', expected: 0, name: 'Invalid string' },
    { input: null, expected: 0, name: 'Null input' },
    { input: undefined, expected: 0, name: 'Undefined input' },
    { input: 123456, expected: 123456, name: 'Number input' },
];

console.log('🧪 Running parseMoney Unit Tests...\n');

let passed = 0, failed = 0;
for (const tc of testCases) {
    const result = parseMoney(tc.input);
    if (result === tc.expected) {
        passed++;
        console.log(`✅ ${tc.name}: Passed`);
    } else {
        failed++;
        console.error(`❌ ${tc.name}: Failed. Input: ${tc.input}, Expected: ${tc.expected}, Got: ${result}`);
    }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
