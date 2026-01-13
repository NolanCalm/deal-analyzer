/**
 * Quick diagnostic test - 3 requests to see rate limiting behavior
 */

const API_URL = 'http://localhost:3001/api/analyze';
const TEST_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function makeRequest(num) {
    console.log(`\n--- Request ${num} ---`);
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image: TEST_IMAGE,
            mimeType: 'image/png',
            emailUnlocked: false
        })
    });

    const remaining = response.headers.get('X-Daily-Remaining');
    const limit = response.headers.get('X-Daily-Limit');

    console.log(`Status: ${response.status}`);
    console.log(`Remaining: ${remaining}/${limit}`);

    return { status: response.status, remaining, limit };
}

async function run() {
    console.log('Testing rate limiting with 3 requests...\n');

    const r1 = await makeRequest(1);
    const r2 = await makeRequest(2);
    const r3 = await makeRequest(3);

    console.log('\n=== SUMMARY ===');
    console.log(`Request 1: ${r1.remaining}/${r1.limit} remaining`);
    console.log(`Request 2: ${r2.remaining}/${r2.limit} remaining`);
    console.log(`Request 3: ${r3.remaining}/${r3.limit} remaining`);

    if (r1.remaining > r2.remaining && r2.remaining > r3.remaining) {
        console.log('\n✅ Rate limiting is working correctly!');
    } else {
        console.log('\n❌ Rate limiting counter is NOT decrementing properly');
        console.log('Check server logs for [Rate Limit] debug messages');
    }
}

run();
