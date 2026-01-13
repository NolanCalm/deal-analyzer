
const fs = require('fs');
const path = require('path');

// Configuration
const API_URL = 'https://deal-analyzer-one.vercel.app/api/analyze';

async function runTest() {
    console.log('Starting Smart Backend Verification (Production)...');
    console.log(`Target API: ${API_URL}`);

    // 1x1 PNG
    const dummyImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    // Rich Text Context (Simulating extracted text from Campbell River flyer)
    const mockTextContext = `
    --- Page 1 ---
    CAMPBELL RIVER PORTFOLIO
    122 UNITS | BRITISH COLUMBIA

    --- Page 15 ---
    FINANCIAL ANALYSIS
    
    INCOME:
    Scheduled Market Rent: $1,800,000
    Less Vacancy (3.0%): $54,000
    Net Rental Income: $1,746,000
    
    EXPENSES:
    Property Taxes: $150,000
    Insurance: $48,000
    Utilities: $120,000
    Repairs & Maintenance: $80,000
    Management Fee: $60,000
    Total Expenses: $488,000
    
    NET OPERATING INCOME (NOI): $1,258,000
    
    PRICING:
    List Price: $47,600,000
    Cap Rate: 2.64%
    `;

    const payload = {
        images: [dummyImage],
        mimeType: 'image/png',
        textContext: mockTextContext
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        console.log('✅ API Response Received');
        console.log('Extracted Data:', JSON.stringify(data, null, 2));

        // Validation - Check nested data.data
        const extracted = data.data;
        if (extracted && extracted.propertyTaxes === 150000 && extracted.insurance === 48000 && extracted.utilities === 120000) {
            console.log('✅ SUCCESS: Production Backend used textContext for extraction.');
        } else {
            console.log('❌ FAILURE: Extracted values do not match textContext.');
            console.log(`Expected: Taxes 150000, Ins 48000, Util 120000`);
            if (extracted) console.log(`Got: Taxes ${extracted.propertyTaxes}, Ins ${extracted.insurance}, Util ${extracted.utilities}`);
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Test Failed:', error);
        process.exit(1);
    }
}

runTest();
