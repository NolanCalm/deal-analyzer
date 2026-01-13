async function test() {
    try {
        console.log('Testing /api/analyze.js ...');
        const response = await fetch('http://localhost:3000/api/analyze.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
                mimeType: 'image/png'
            })
        });
        const text = await response.text();
        console.log('Response Status:', response.status);
        console.log('Response Body:', text.substring(0, 100));
    } catch (e) {
        console.error('Test failed:', e);
    }
}

test();
