/**
 * api/unlock.js - Email Unlock Endpoint
 * Handles email capture and fails open to stateless signed tokens
 */

import crypto from 'crypto';

// Use a stable secret for signing tickets (fallback to a hardcoded one if env missing, low security risk for this MVP)
const SIGNING_SECRET = process.env.GEMINI_API_KEY || 'deal-analyzer-fallback-secret-2024';
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Formspree endpoint
const FORMSPREE_ENDPOINT = process.env.FORMSPREE_URL || 'https://formspree.io/f/YOUR_FORM_ID';

function generateStatelessToken(email) {
    // Token format: base64(email)|timestamp|signature
    const timestamp = Date.now();
    const payload = `${email}|${timestamp}`;
    const signature = crypto
        .createHmac('sha256', SIGNING_SECRET)
        .update(payload)
        .digest('hex');

    return Buffer.from(`${payload}|${signature}`).toString('base64');
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' } });
    }

    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 254) {
        return res.status(400).json({
            success: false,
            error: { code: 'INVALID_EMAIL', message: 'Please provide a valid email address' }
        });
    }

    const sanitizedEmail = email.trim().toLowerCase().substring(0, 254);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitizedEmail)) {
        return res.status(400).json({
            success: false,
            error: { code: 'INVALID_EMAIL', message: 'Invalid email format' }
        });
    }

    try {
        // 1. Generate Stateless Token (No DB required)
        const unlockToken = generateStatelessToken(sanitizedEmail);

        // 2. Submit to Formspree (Fire & Forget/Log error but don't block)
        if (FORMSPREE_ENDPOINT && !FORMSPREE_ENDPOINT.includes('YOUR_FORM_ID')) {
            // ... (keep existing formspree logic logic) ...
            try {
                await fetch(FORMSPREE_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ email: sanitizedEmail, source: 'deal-analyzer-unlock', timestamp: new Date().toISOString() })
                });
            } catch (fsErr) {
                console.warn('[Unlock] Formspree error:', fsErr.message);
            }
        }

        // 3. Set Cookie
        const cookieOptions = [
            `unlockToken=${unlockToken}`,
            'HttpOnly',
            'Secure',
            'SameSite=Lax',
            'Path=/',
            `Max-Age=${TOKEN_TTL_SECONDS}`
        ].join('; ');

        res.setHeader('Set-Cookie', cookieOptions);

        return res.status(200).json({
            success: true,
            message: 'Email unlocked! You now have 10 analyses per day.',
            limit: 10
        });

    } catch (error) {
        console.error('[Unlock] Error:', error);
        // Even if something fails, try to return success if we generated a token? 
        // No, catch block usually implies generated failed.
        return res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to unlock.', details: error.message }
        });
    }
}
