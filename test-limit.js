
const https = require('https');

// Simulation Config
const OLD_LIMIT_FILE_SIZE = 3.8 * 1024 * 1024; // 3.8 MB
const NEW_LIMIT_FILE_SIZE = 3.0 * 1024 * 1024; // 3.0 MB

const BASE64_OVERHEAD = 1.33333; // 4/3

// Calculate payload sizes
const OLD_PAYLOAD_SIZE = Math.ceil(OLD_LIMIT_FILE_SIZE * BASE64_OVERHEAD);
const NEW_PAYLOAD_SIZE = Math.ceil(NEW_LIMIT_FILE_SIZE * BASE64_OVERHEAD);

console.log(`[Test Config]`);
console.log(`- Old Limit (3.8MB) -> Payload: ${(OLD_PAYLOAD_SIZE / 1024 / 1024).toFixed(2)} MB`);
console.log(`- New Limit (3.0MB) -> Payload: ${(NEW_PAYLOAD_SIZE / 1024 / 1024).toFixed(2)} MB`);
console.log(`- Vercel Max: 4.50 MB\n`);

async function testPayload(sizeBytes, label) {
    console.log(`Testing [${label}] with payload size: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB...`);

    // Create dummy base64 string (A is a valid base64 char)
    const dummyBase64 = 'A'.repeat(sizeBytes);
    const postData = JSON.stringify({
        image: dummyBase64,
        mimeType: 'application/pdf',
        emailUnlocked: true
    });

    const options = {
        hostname: 'deal-analyzer-one.vercel.app',
        port: 443,
        path: '/api/analyze',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return new Promise((resolve) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                const isPayloadError = res.statusCode === 413 || (body.includes && body.includes('Payload Too Large'));
                resolve({
                    statusCode: res.statusCode,
                    isPayloadError,
                    bodySnippet: body.substring(0, 100)
                });
            });
        });

        req.on('error', (e) => {
            console.error(`Request failed: ${e.message}`);
            resolve({ error: e.message });
        });

        req.write(postData);
        req.end();
    });
}

async function run() {
    // 1. Test the Old Limit (Should Fail)
    const resultOld = await testPayload(OLD_PAYLOAD_SIZE, 'OLD LIMIT (3.8MB)');
    if (resultOld.isPayloadError || resultOld.statusCode === 413) {
        console.log(`✅ [PASS] Old limit correctly rejected as too large (Status: ${resultOld.statusCode})`);
    } else {
        console.log(`❌ [FAIL] Old limit was accepted!? (Status: ${resultOld.statusCode}) - This is unexpected.`);
    }

    // 2. Test the New Limit (Should Pass Vercel, likely fail at Backend logic but NOT 413)
    const resultNew = await testPayload(NEW_PAYLOAD_SIZE, 'NEW LIMIT (3.0MB)');
    if (!resultNew.isPayloadError && resultNew.statusCode !== 413) {
        console.log(`✅ [PASS] New limit accepted by Vercel! (Status: ${resultNew.statusCode})`);
        console.log(`   (Note: 500/400 is expected from backend as data is dummy, important is NOT 413)`);
    } else {
        console.log(`❌ [FAIL] New limit still rejected (Status: ${resultNew.statusCode})`);
    }
}

run();
