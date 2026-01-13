
const fs = require('fs');
const https = require('https');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'test-data', 'flyer-2-cbre-portfolio.pdf');
const HOSTNAME = 'deal-analyzer-one.vercel.app';
const API_PATH = '/api/analyze';

async function uploadData(buffer, label) {
    console.log(`\n--- Testing ${label} ---`);
    console.log(`Payload Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Convert to Base64 (simulating client logic)
    const base64Data = buffer.toString('base64');
    const postBody = JSON.stringify({
        image: base64Data,
        mimeType: 'application/pdf',
        emailUnlocked: true
    });

    const payloadSize = Buffer.byteLength(postBody);
    console.log(`Encoded JSON Payload: ${(payloadSize / 1024 / 1024).toFixed(2)} MB`);

    if (payloadSize > 4.5 * 1024 * 1024) {
        console.log(`⚠️  WARNING: Payload exceeds Vercel 4.5MB limit! Expecting rejection.`);
    } else {
        console.log(`✅ Payload within Vercel limit.`);
    }

    const options = {
        hostname: HOSTNAME,
        port: 443,
        path: API_PATH,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': payloadSize
        }
    };

    return new Promise((resolve) => {
        const req = https.request(options, (res) => {
            console.log(`Response Status: ${res.statusCode} ${res.statusCode === 413 ? '(Payload Too Large)' : ''}`);
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log('✅ SUCCESS: API accepted and processed the file.');
                } else if (res.statusCode === 413) {
                    console.log('❌ REJECTED: Vercel blocked the upload (Too Large).');
                } else {
                    console.log(`ℹ️  ACCEPTED by Vercel, but Backend returned: ${res.statusCode}`);
                    // This is considered a PASS for the file-size test because Vercel didn't block it.
                    // The backend error is likely due to the "Simulated Optimization" creating an invalid PDF structure.
                }
                resolve();
            });
        });

        req.on('error', (e) => {
            console.error(`Request Error: ${e.message}`);
            resolve();
        });

        req.write(postBody);
        req.end();
    });
}

async function run() {
    if (!fs.existsSync(FILE_PATH)) {
        console.error(`File not found: ${FILE_PATH}`);
        return;
    }

    const fullFile = fs.readFileSync(FILE_PATH);
    console.log(`Original File: ${path.basename(FILE_PATH)}`);
    console.log(`Size: ${(fullFile.length / 1024 / 1024).toFixed(2)} MB`);

    // 1. Test Full File 
    // This replicates what happens if optimization code DOES NOT fire.
    await uploadData(fullFile, 'ORIGINAL FILE (8.2 MB)');

    // 2. Test Optimized File
    // We simulate the browser's "Smart Optimization" by slicing the buffer to exactly 3.0 MB.
    // Note: The resulting PDF is corrupt, so Gemini will fail, but Vercel should ACCEPT the request.
    const OPTIMIZED_SIZE = 3.0 * 1024 * 1024;
    const optimizedFile = fullFile.subarray(0, OPTIMIZED_SIZE);

    await uploadData(optimizedFile, 'SIMULATED OPTIMIZATION (3.0 MB)');
}

run();
