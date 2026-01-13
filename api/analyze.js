/**
 * api/analyze.js - Vercel Serverless Function
 * Securely handles Gemini API calls using server-side API key
 * Includes daily rate limiting and input validation
 */

import fs from 'fs';
import path from 'path';

// ==========================================
// RATE LIMITING (File-based for persistence)
// ==========================================

const LIMITS = {
    FREE_TIER: 8,
    EMAIL_TIER: 18,
};

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB base64

// Use /tmp for Vercel serverless (persists during warm starts)
const USAGE_FILE = path.join('/tmp', 'rate-limit-usage.json');

function loadUsageData() {
    try {
        if (fs.existsSync(USAGE_FILE)) {
            const data = fs.readFileSync(USAGE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('[Rate Limit] Error loading usage data:', error.message);
    }
    return {};
}

function saveUsageData(data) {
    try {
        fs.writeFileSync(USAGE_FILE, JSON.stringify(data), 'utf8');
    } catch (error) {
        console.error('[Rate Limit] Error saving usage data:', error.message);
    }
}

function getDailyKey(ip) {
    const today = new Date().toISOString().split('T')[0];
    return `${ip}:${today}`;
}

function checkDailyLimit(ip, hasEmailUnlock) {
    const key = getDailyKey(ip);
    const allUsage = loadUsageData();
    const usage = allUsage[key] || { count: 0, emailUnlocked: false };

    console.log(`[Rate Limit] Checking limit for key: ${key}`);
    console.log(`[Rate Limit] Current usage:`, usage);
    console.log(`[Rate Limit] Has email unlock: ${hasEmailUnlock}`);

    // Check if this is a new day (reset)
    const limit = usage.emailUnlocked || hasEmailUnlock
        ? LIMITS.EMAIL_TIER
        : LIMITS.FREE_TIER;

    if (usage.count >= limit) {
        console.log(`[Rate Limit] BLOCKED - count ${usage.count} >= limit ${limit}`);
        return {
            allowed: false,
            remaining: 0,
            limit,
            needsEmail: !usage.emailUnlocked && limit === LIMITS.FREE_TIER
        };
    }

    // Allow and increment
    usage.count++;
    if (hasEmailUnlock) usage.emailUnlocked = true;

    // Save updated usage
    allUsage[key] = usage;
    saveUsageData(allUsage);

    const remaining = limit - usage.count;
    console.log(`[Rate Limit] ALLOWED - incremented to ${usage.count}, remaining: ${remaining}`);
    console.log(`[Rate Limit] Saved usage to file`);

    return {
        allowed: true,
        remaining,
        limit,
        needsEmail: usage.count >= LIMITS.FREE_TIER && !usage.emailUnlocked
    };
}

function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    const realIp = req.headers['x-real-ip'];
    const socketIp = req.socket?.remoteAddress;

    // Normalize localhost addresses to a single value
    let ip = forwarded || realIp || socketIp || 'unknown';

    // Normalize IPv6 localhost to IPv4
    if (ip === '::1' || ip === '::ffff:127.0.0.1') {
        ip = '127.0.0.1';
    }

    console.log(`[Rate Limit] Client IP detected: ${ip} (forwarded: ${forwarded}, real: ${realIp}, socket: ${socketIp})`);
    return ip;
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

RULES:
1. Extract exact values when clearly stated in the document
2. If a value is NOT explicitly shown, estimate using market averages for a comparable multi-family property and include the field name in the "estimates" array
3. For grossRent, if only annual is shown, divide by 12 for monthly
4. All dollar amounts should be numbers without currency symbols

OUTPUT FORMAT (JSON only, no markdown):
{
  "address": "123 Main Street, City, ST 12345",
  "units": 4,
  "askingPrice": 500000,
  "grossRent": 5000,
  "propertyTaxes": 6000,
  "insurance": 2400,
  "utilities": 0,
  "estimates": []
}`;

export default async function handler(req, res) {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { image, mimeType, emailUnlocked } = req.body;

    // 2. Validate input exists
    if (!image || !mimeType) {
        return res.status(400).json({ error: 'Missing image data or mimeType' });
    }

    // 3. Validate mimeType
    if (!ALLOWED_TYPES.includes(mimeType)) {
        return res.status(400).json({
            error: `Unsupported file type. Allowed: ${ALLOWED_TYPES.join(', ')}`
        });
    }

    // 4. Validate payload size (5MB max for base64)
    if (image.length > MAX_PAYLOAD_SIZE) {
        return res.status(413).json({ error: 'File too large. Maximum 5MB.' });
    }

    // 5. Check rate limit
    const clientIP = getClientIP(req);
    const rateCheck = checkDailyLimit(clientIP, emailUnlocked === true);

    // Set rate limit headers for frontend
    res.setHeader('X-Daily-Remaining', rateCheck.remaining);
    res.setHeader('X-Daily-Limit', rateCheck.limit);
    res.setHeader('X-Needs-Email', rateCheck.needsEmail ? 'true' : 'false');

    if (!rateCheck.allowed) {
        return res.status(429).json({
            error: 'Daily limit reached. Come back tomorrow or unlock more with your email.',
            remaining: 0,
            limit: rateCheck.limit,
            needsEmail: rateCheck.needsEmail
        });
    }

    // 6. Check API key
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        console.error('GEMINI_API_KEY is not configured in environment variables');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    const requestBody = {
        contents: [{
            parts: [
                { text: EXTRACTION_PROMPT },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: image
                    }
                }
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            topP: 0.8,
            maxOutputTokens: 1024
        }
    };

    try {
        console.log(`[Backend] Calling Gemini API for mimeType: ${mimeType}`);
        const response = await fetch(`${API_URL}?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        console.log(`[Backend] Gemini Status: ${response.status}`);

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[Backend] Gemini Error:', JSON.stringify(errorData));
            throw new Error(errorData.error?.message || `API Error: ${response.status}`);
        }

        const data = await response.json();
        console.log('[Backend] Gemini Data Received');

        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textContent) {
            console.error('[Backend] Empty textContent in candidate:', JSON.stringify(data));
            throw new Error('No content in API response');
        }

        console.log('[Backend] Extracted Text Snippet:', textContent.substring(0, 200));

        // Parse JSON from response - try multiple strategies
        let propertyData;

        // Strategy 1: Try to find JSON block (with or without markdown)
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                propertyData = JSON.parse(jsonMatch[0]);
                console.log('[Backend] Parse Successful (Strategy 1)');
            } catch (e) {
                console.error('[Backend] JSON parse failed (Strategy 1):', e.message);
                console.error('[Backend] Attempted to parse:', jsonMatch[0].substring(0, 200));
            }
        }

        // Strategy 2: Try to extract from markdown code block
        if (!propertyData) {
            const codeBlockMatch = textContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (codeBlockMatch) {
                try {
                    propertyData = JSON.parse(codeBlockMatch[1]);
                    console.log('[Backend] Parse Successful (Strategy 2 - markdown)');
                } catch (e) {
                    console.error('[Backend] JSON parse failed (Strategy 2):', e.message);
                }
            }
        }

        // Strategy 3: Clean up common issues and retry
        if (!propertyData && jsonMatch) {
            try {
                // Remove markdown formatting, trailing commas, etc.
                let cleaned = jsonMatch[0]
                    .replace(/```json|```/g, '')
                    .replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
                    .trim();
                propertyData = JSON.parse(cleaned);
                console.log('[Backend] Parse Successful (Strategy 3 - cleaned)');
            } catch (e) {
                console.error('[Backend] JSON parse failed (Strategy 3):', e.message);
            }
        }

        if (!propertyData) {
            console.error('[Backend] All parsing strategies failed');
            console.error('[Backend] Full response:', textContent);
            throw new Error('Could not parse JSON from AI response');
        }

        return res.status(200).json({
            success: true,
            data: propertyData,
            estimates: propertyData.estimates || [],
            remaining: rateCheck.remaining,
            limit: rateCheck.limit,
            needsEmail: rateCheck.needsEmail
        });

    } catch (error) {
        console.error('[Backend] API Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
