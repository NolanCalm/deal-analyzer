/**
 * gemini.js - AI Property Data Extraction (Backend Proxy Version)
 * Proxies requests to our serverless /api/analyze endpoint
 */

/**
 * Extract property data from an image or PDF
 * @param {File} file - The uploaded file
 * @returns {Promise<Object>} Extracted property data
 */
export async function extractPropertyData(file) {
    // Convert file to base64
    const base64Data = await fileToBase64(file);
    const mimeType = file.type || 'image/jpeg';

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: base64Data,
                mimeType: mimeType
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `API Error: ${response.status}`);
        }

        return await response.json();

    } catch (error) {
        console.error('Extraction error:', error);
        return {
            success: false,
            error: error.message,
            data: null
        };
    }
}

/**
 * Convert File to base64 string
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Legacy support for createGeminiClient
 */
export function createGeminiClient() {
    return {
        extractPropertyData
    };
}

/**
 * Validate API key format (now handled server-side, but keeping for legacy compatibility if needed)
 */
export function validateApiKey(key) {
    return true; // Key management is now server-side
}
