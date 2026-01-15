/**
 * api/unlock.js - Email Unlock Endpoint
 * Handles email capture, creates unlock tokens, and stores in Redis
 */

import Redis from 'ioredis';
import crypto from 'crypto';

// Initialize Redis from REDIS_URL
let redis;
try {
    if (process.env.REDIS_URL) {
        redis = new Redis(process.env.REDIS_URL, {
            family: 4, // Force IPv4
            tls: process.env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
            connectTimeout: 10000
        });

        redis.on('error', (err) => {
            console.warn('[Redis] Connection error:', err.message);
        });
    }
} catch (e) {
    console.warn('[Redis] Could not initialize:', e.message);
}

// Formspree endpoint - Replace with your actual form ID
const FORMSPREE_ENDPOINT = process.env.FORMSPREE_URL || 'https://formspree.io/f/YOUR_FORM_ID';

// Token expires after 30 days
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export default async function handler(req, res) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' } });
    }

    const { email } = req.body;

    // Validate email
    if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 254) {
        return res.status(400).json({
            success: false,
            error: { code: 'INVALID_EMAIL', message: 'Please provide a valid email address' }
        });
    }

    const sanitizedEmail = email.trim().toLowerCase().substring(0, 254);

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitizedEmail)) {
        return res.status(400).json({
            success: false,
            error: { code: 'INVALID_EMAIL', message: 'Invalid email format' }
        });
    }

    try {
        // Generate a secure unlock token
        const unlockToken = crypto.randomBytes(32).toString('hex');

        // Store unlock token in Redis with TTL
        // Key: unlock:<token> -> { email, createdAt }
        if (!redis) {
            throw new Error('Redis not initialized');
        }
        await redis.set(`unlock:${unlockToken}`, JSON.stringify({
            email: sanitizedEmail,
            createdAt: new Date().toISOString()
        }), { ex: TOKEN_TTL_SECONDS });

        // Submit to Formspree (server-side, so no client exposure)
        if (FORMSPREE_ENDPOINT && !FORMSPREE_ENDPOINT.includes('YOUR_FORM_ID')) {
            try {
                await fetch(FORMSPREE_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        email: sanitizedEmail,
                        source: 'deal-analyzer-unlock',
                        timestamp: new Date().toISOString()
                    })
                });
            } catch (formspreeError) {
                // Log but don't fail - user still gets unlocked
                console.error('[Unlock] Formspree submission failed:', formspreeError.message);
            }
        }

        // Set HTTP-only cookie with the unlock token
        const cookieOptions = [
            `unlockToken=${unlockToken}`,
            'HttpOnly',
            'Secure',
            'SameSite=Lax',
            'Path=/',
            `Max-Age=${TOKEN_TTL_SECONDS}`
        ].join('; ');

        res.setHeader('Set-Cookie', cookieOptions);

        console.log(`[Unlock] Success for email: ${sanitizedEmail.substring(0, 3)}***`);

        return res.status(200).json({
            success: true,
            message: 'Email unlocked! You now have 10 analyses per day.',
            limit: 10
        });

    } catch (error) {
        console.error('[Unlock] Error:', error);
        return res.status(500).json({
            success: false,
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to unlock. Please try again.',
                details: error.message // DEBUG ONLY
            }
        });
    }
}
