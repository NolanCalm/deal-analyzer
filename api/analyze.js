/**
 * api/analyze.js - Vercel Serverless Function
 * Securely handles Gemini API calls using server-side API key
 * Includes durable rate limiting via Upstash Redis (HTTP)
 */

import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const SIGNING_SECRET = process.env.GEMINI_API_KEY || 'deal-analyzer-fallback-secret-2024';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

// Initialize Redis from REDIS_URL (converting TCP -> HTTP)
let redis;
try {
    if (process.env.REDIS_URL && process.env.REDIS_URL.includes('rediss://')) {
        // Parse "rediss://default:TOKEN@host:port"
        const urlObj = new URL(process.env.REDIS_URL);

        // Construct standard Upstash REST URL: "https://<host>"
        const baseUrl = `https://${urlObj.hostname}`;
        const token = urlObj.password;

        redis = new Redis({
            url: baseUrl,
            token: token
        });
    } else if (process.env.UPSTASH_REDIS_REST_URL) {

        // Construct standard Upstash REST URL: "https://<host>"
        const baseUrl = `https://${urlObj.hostname}`;
        const token = urlObj.password;

        redis = new Redis({
            url: baseUrl,
            token: token
        });
    } else if (process.env.UPSTASH_REDIS_REST_URL) {
        redis = Redis.fromEnv();
    }
} catch (e) {
    console.warn('[Redis] Could not initialize:', e.message);
}

// ==========================================
// CONFIGURATION
// ==========================================

const LIMITS = {
    FREE_TIER: 3,
    UNLOCKED_TIER: 10,
};

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB base64
const MAX_TEXT_CONTEXT = 15000; // 15KB text context cap
const MAX_IMAGES = 6;

// Abuse detection patterns
const ABUSE_PATTERNS = [
    /\b(eval|javascript:|data:text\/html)\b/i,
    /<script/i,
    /on\w+\s*=/i // onclick=, onerror=, etc.
];

// ==========================================
// RATE LIMITING (Vercel KV - Durable)
// ==========================================

function getDailyKey(identifier) {
    const today = new Date().toISOString().split('T')[0];
    return `rate:${identifier}:${today}`;
}

async function checkDailyLimit(ip, unlockToken) {
    // 1. Validate Unlock Token (Stateless)
    let isUnlocked = false;
    let identifier = ip;

    if (unlockToken) {
        try {
            const raw = Buffer.from(unlockToken, 'base64').toString('utf-8');

            // Format: email|timestamp|signature
            const parts = raw.split('|');
            const providedSig = parts.pop();
            const timestamp = parseInt(parts.pop(), 10);
            const email = parts.join('|');
            const rebuildPayload = `${email}|${timestamp}`;

            // Verify signature
            const expectedSig = crypto
                .createHmac('sha256', SIGNING_SECRET)
                .update(rebuildPayload)
                .digest('hex');

            const now = Date.now();

            if (providedSig === expectedSig && (now - timestamp) < TOKEN_TTL_MS) {
                isUnlocked = true;
                // Use email hash as identifier to prevent IP hopping, but keep privacy
                const emailHash = crypto.createHash('sha256').update(email).digest('hex').substring(0, 16);
                identifier = `unlocked:${emailHash}`;
            }
        } catch (e) {
            console.warn('[Security] Invalid unlock token:', e.message);
        }
    }

    const limit = isUnlocked ? LIMITS.UNLOCKED_TIER : LIMITS.FREE_TIER;
    const key = getDailyKey(identifier);

    // If Redis not available, fail open
    if (!redis) {
        console.warn('[Rate Limit] Redis not initialized, allowing request');
        // If they have a valid token, they are unlocked even if Redis is down
        return { allowed: true, remaining: 1, limit, needsEmail: !isUnlocked };
    }

    try {
        // Use atomic increment
        const count = await redis.incr(key);

        // Set expiry on first use (86400 seconds = 24 hours)
        if (count === 1) {
            await redis.expire(key, 86400);
        }

        console.log(`[Rate Limit] Key: ${key}, Count: ${count}, Limit: ${limit}, Unlocked: ${isUnlocked}`);

        if (count > limit) {
            return {
                allowed: false,
                remaining: 0,
                limit,
                needsEmail: !isUnlocked
            };
        }

        return {
            allowed: true,
            remaining: limit - count,
            limit,
            needsEmail: !isUnlocked && count >= LIMITS.FREE_TIER
        };
    } catch (error) {
        console.error('[Rate Limit] Redis error, falling back to allow:', error.message);
        return { allowed: true, remaining: 1, limit, needsEmail: !isUnlocked };
    }
}

function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    const realIp = req.headers['x-real-ip'];
    let ip = forwarded || realIp || 'unknown';

    // Normalize IPv6 localhost
    if (ip === '::1' || ip === '::ffff:127.0.0.1') {
        ip = '127.0.0.1';
    }

    return ip;
}

function getUnlockToken(req) {
    // Parse cookies from request
    const cookieHeader = req.headers.cookie || '';
    const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [key, ...val] = c.trim().split('=');
            return [key, val.join('=')];
        })
    );
    return cookies.unlockToken || null;
}

// ==========================================
// DATA NORMALIZATION
// ==========================================

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

function normalizePropertyData(raw) {
    const schema = {
        address: { type: 'string', maxLen: 500 },
        units: { type: 'integer', min: 0, max: 10000 },
        askingPrice: { type: 'money', min: 0, max: 1e10 },
        grossRent: { type: 'money', min: 0, max: 1e8 },
        propertyTaxes: { type: 'money', min: 0, max: 1e8 },
        insurance: { type: 'money', min: 0, max: 1e8 },
        utilities: { type: 'money', min: 0, max: 1e8 },
        noi: { type: 'money', min: -1e9, max: 1e10 },
        estimates: { type: 'array', maxLen: 20 }
    };

    const normalized = {};

    for (const [key, config] of Object.entries(schema)) {
        const value = raw[key];

        switch (config.type) {
            case 'string':
                normalized[key] = typeof value === 'string'
                    ? value.trim().substring(0, config.maxLen)
                    : '';
                break;

            case 'integer':
                const intVal = parseInt(parseMoney(value), 10);
                normalized[key] = Math.min(Math.max(intVal || 0, config.min), config.max);
                break;

            case 'money':
                const moneyVal = parseMoney(value);
                normalized[key] = Math.min(Math.max(moneyVal, config.min), config.max);
                break;

            case 'array':
                normalized[key] = Array.isArray(value)
                    ? value.filter(v => typeof v === 'string').slice(0, config.maxLen)
                    : [];
                break;
        }
    }

    return normalized;
}

// ==========================================
// TEXT CONTEXT FALLBACKS
// ==========================================

function deriveGrossRentFromTextContext(textContext) {
    if (typeof textContext !== 'string' || textContext.trim().length === 0) return null;

    const totalRowRegex = /Total\s+(\d{1,5})\s+\d{1,5}\s*SF\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*)(?:\.[0-9]{1,2})?\s+\$?\s*\d+(?:\.\d+)?/gi;

    let match;
    let sumUnits = 0;
    let sumGrossRent = 0;

    while ((match = totalRowRegex.exec(textContext)) !== null) {
        const units = Number(match[1]);
        const avgRent = parseMoney(match[2]);

        if (!Number.isFinite(units) || units <= 0) continue;
        if (!Number.isFinite(avgRent) || avgRent <= 0) continue;
        if (avgRent < 250 || avgRent > 20000) continue;

        sumUnits += units;
        sumGrossRent += units * avgRent;
    }

    if (sumUnits <= 0 || sumGrossRent <= 0) return null;
    return { grossRent: sumGrossRent, units: sumUnits };
}

// ==========================================
// EXTRACTION PROMPT
// ==========================================

const EXTRACTION_PROMPT = `Act as a Senior Real Estate Investment Analyst. 
Analyze this property document (broker flyer, listing, or pro-forma) and extract the following data:

REQUIRED FIELDS:
- address: Full property address
- units: Number of units (if multi-family)
- askingPrice: Listed asking price in USD
- grossRent: Monthly gross rental income in USD
- propertyTaxes: Annual property taxes in USD
- insurance: Annual insurance cost in USD
- utilities: Annual utilities cost in USD (if landlord-paid, otherwise 0)
- noi: Net Operating Income (Annual)

CRITICAL EXTRACTION RULES:
1. **Financial Tables:** Look for tables labeled "Pro Forma", "Actual", "Current", or "Operations".
2. **Column Selection:** Always prefer "Current" or "Actual" figures over "Pro Forma" or "Year 1" if available.
3. **Expenses:** 
   - Sum up "Real Estate Taxes" for propertyTaxes.
   - Sum up "Insurance" for insurance.
   - Sum up "Utilities" (Water, Sewer, Gas, Electric, Trash, Hydro, Oil) for utilities.
4. **Calculated NOI Check:** If the document explicitly states "Net Operating Income" or "NOI", TRUST THIS NUMBER.
5. **Gross Rent:** If "Gross Potential Rent" and "Effective Gross Income" are both present, use "Gross Potential Rent". Convert Annual -> Monthly by dividing by 12.
6. **Spaced Text:** Watch out for stylized headers like "1 2 1 U N I T S". Interpret "1 2 1" as 121.

FALLBACK RULES:
1. **Utilities:** If text says "Individually Metered" or "Tenant Pays", set utilities to a low estimate (e.g. $100/unit for common area).
2. **Insurance:** If missing, ESTIMATE at $450 per unit/year.
3. **Property Taxes:** If missing, estimate at 1.1% of Asking Price.
4. **General:** If a value is NOT explicitly shown, ESTIMATE it and mark it in "estimates".

OUTPUT FORMAT (JSON only, no markdown):
{"address":"","units":0,"askingPrice":0,"grossRent":0,"propertyTaxes":0,"insurance":0,"utilities":0,"noi":0,"estimates":[]}
`;

// ==========================================
// RESPONSE HELPERS
// ==========================================

function errorResponse(res, status, code, message, extra = {}) {
    return res.status(status).json({
        success: false,
        error: { code, message },
        ...extra
    });
}

// ==========================================
// MAIN HANDLER
// ==========================================

export default async function handler(req, res) {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
        return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
    }

    // Log request (partial IP for privacy)
    const clientIP = getClientIP(req);
    console.log(JSON.stringify({
        event: 'analyze_request',
        ip: clientIP.substring(0, 8) + '***',
        timestamp: new Date().toISOString()
    }));

    const { image, images, mimeType, textContext } = req.body;
    // NOTE: emailUnlocked is NOT read from request body - derived server-side

    // 2. Validate input exists
    if ((!image && (!images || images.length === 0)) || !mimeType) {
        return errorResponse(res, 400, 'MISSING_INPUT', 'Missing image data or mimeType');
    }

    // 3. Validate mimeType (PDF not allowed - client converts to JPEG)
    if (!ALLOWED_TYPES.includes(mimeType)) {
        return errorResponse(res, 400, 'INVALID_TYPE',
            `Unsupported file type. Allowed: ${ALLOWED_TYPES.join(', ')}`);
    }

    // 4. Prepare and validate images
    const imageParts = [];
    let totalPayloadSize = 0;

    const imageArray = images && images.length > 0 ? images : (image ? [image] : []);

    if (imageArray.length > MAX_IMAGES) {
        return errorResponse(res, 400, 'TOO_MANY_IMAGES', `Maximum ${MAX_IMAGES} images allowed`);
    }

    for (const imgData of imageArray) {
        if (typeof imgData !== 'string') {
            return errorResponse(res, 400, 'INVALID_IMAGE', 'Invalid image data. Expected base64 string.');
        }
        imageParts.push({
            inlineData: { data: imgData, mimeType }
        });
        totalPayloadSize += imgData.length;
    }

    if (imageParts.length === 0) {
        return errorResponse(res, 400, 'NO_IMAGES', 'No valid image data provided');
    }

    // 5. Validate payload size
    if (totalPayloadSize > MAX_PAYLOAD_SIZE) {
        return errorResponse(res, 413, 'PAYLOAD_TOO_LARGE',
            `Total file size too large. Maximum ${MAX_PAYLOAD_SIZE / (1024 * 1024)}MB.`);
    }

    // 6. Sanitize textContext
    let sanitizedTextContext = '';
    if (textContext && typeof textContext === 'string') {
        // Check for abuse patterns
        if (ABUSE_PATTERNS.some(p => p.test(textContext))) {
            console.warn('[Security] Abuse pattern detected in textContext');
            return errorResponse(res, 400, 'INVALID_CONTENT', 'Invalid content detected');
        }
        sanitizedTextContext = textContext.substring(0, MAX_TEXT_CONTEXT);
    }

    // 7. Check rate limit (server-side, using cookie token)
    const unlockToken = getUnlockToken(req);
    const rateCheck = await checkDailyLimit(clientIP, unlockToken);

    // Set rate limit headers
    res.setHeader('X-Daily-Remaining', rateCheck.remaining);
    res.setHeader('X-Daily-Limit', rateCheck.limit);
    res.setHeader('X-Needs-Email', rateCheck.needsEmail ? 'true' : 'false');

    if (!rateCheck.allowed) {
        console.log(JSON.stringify({ event: 'rate_limit_hit', ip: clientIP.substring(0, 8) + '***' }));
        return errorResponse(res, 429, 'RATE_LIMIT',
            'Daily limit reached. Unlock more analyses with your email.',
            { remaining: 0, limit: rateCheck.limit, needsEmail: rateCheck.needsEmail });
    }

    // 8. Check API key
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        console.error('GEMINI_API_KEY is not configured');
        return errorResponse(res, 500, 'CONFIG_ERROR', 'Server configuration error');
    }

    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    const finalPrompt = sanitizedTextContext
        ? `${EXTRACTION_PROMPT}\n\nDOCUMENT TEXT CONTEXT:\n${sanitizedTextContext}`
        : EXTRACTION_PROMPT;

    const requestBody = {
        contents: [{
            parts: [
                { text: finalPrompt },
                ...imageParts
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            topP: 0.8,
            maxOutputTokens: 1024
        }
    };

    try {
        console.log(`[Backend] Calling Gemini API with ${imageParts.length} images`);
        const response = await fetch(`${API_URL}?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        console.log(`[Backend] Gemini Status: ${response.status}`);

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[Backend] Gemini Error:', JSON.stringify(errorData));
            const geminiMessage = errorData.error?.message || `API Error: ${response.status}`;

            // Map Gemini errors to user-friendly codes
            if (response.status === 429) {
                return errorResponse(res, 429, 'AI_RATE_LIMIT', 'AI service is busy. Please try again in a moment.');
            }
            return errorResponse(res, 500, 'AI_ERROR', geminiMessage);
        }

        const data = await response.json();
        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textContent) {
            console.error('[Backend] Empty response from Gemini');
            return errorResponse(res, 500, 'EMPTY_RESPONSE', 'No content in AI response');
        }

        // Parse JSON from response
        let propertyData;
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            try {
                propertyData = JSON.parse(jsonMatch[0]);
            } catch (e) {
                // Try cleaning up common issues
                try {
                    const cleaned = jsonMatch[0]
                        .replace(/```json|```/g, '')
                        .replace(/,(\s*[}\]])/g, '$1')
                        .trim();
                    propertyData = JSON.parse(cleaned);
                } catch (e2) {
                    console.error('[Backend] JSON parse failed:', e2.message);
                }
            }
        }

        if (!propertyData) {
            console.error('[Backend] Could not parse AI response');
            return errorResponse(res, 500, 'PARSE_ERROR', 'Could not parse AI response');
        }

        // Normalize data with schema validation
        const normalizedData = normalizePropertyData(propertyData);

        // Apply textContext fallback for gross rent if needed
        const derivedRent = deriveGrossRentFromTextContext(sanitizedTextContext);
        if (derivedRent) {
            const aiGrossRent = normalizedData.grossRent || 0;
            const aiUnits = normalizedData.units || 0;
            const aiPerUnit = aiUnits > 0 ? (aiGrossRent / aiUnits) : 0;
            const derivedPerUnit = derivedRent.units > 0 ? (derivedRent.grossRent / derivedRent.units) : 0;

            if ((aiGrossRent <= 0 || aiPerUnit < 300) && derivedPerUnit >= 500) {
                normalizedData.grossRent = derivedRent.grossRent;
                if (!normalizedData.estimates.includes('grossRent')) {
                    normalizedData.estimates.push('grossRent');
                }
                console.log(`[Backend] Applied fallback grossRent: ${derivedRent.grossRent}`);
            }
        }

        console.log(JSON.stringify({
            event: 'analyze_success',
            extractedFields: Object.keys(normalizedData).filter(k => normalizedData[k]),
            estimatesCount: normalizedData.estimates?.length || 0
        }));

        return res.status(200).json({
            success: true,
            data: normalizedData,
            estimates: normalizedData.estimates || [],
            remaining: rateCheck.remaining,
            limit: rateCheck.limit,
            needsEmail: rateCheck.needsEmail
        });

    } catch (error) {
        console.error('[Backend] Unexpected error:', error);
        return errorResponse(res, 500, 'SERVER_ERROR', 'An unexpected error occurred');
    }
}
