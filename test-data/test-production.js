/**
 * Test production deployment rate limiting
 */

const PROD_URL = 'https://deal-analyzer-one.vercel.app/api/analyze';
const TEST_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function testProduction() {
    console.log('Testing production deployment...\n');

    try {
        const response = await fetch(PROD_URL, {
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
        const needsEmail = response.headers.get('X-Needs-Email');

        console.log(`Status: ${response.status}`);
        console.log(`Rate Limit: ${remaining}/${limit} remaining`);
        console.log(`Needs Email: ${needsEmail}`);

        if (remaining !== null && limit !== null) {
            console.log('\n✅ Production deployment is working!');
            console.log('✅ Rate limiting headers are present');
            console.log('\nProduction URL: https://ideahunter-gamma.vercel.app');
        } else {
            console.log('\n⚠️  Rate limiting headers missing');
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testProduction();
