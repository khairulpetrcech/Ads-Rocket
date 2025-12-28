/**
 * API endpoint to log user when they connect their FB account.
 * Stores user data in Vercel KV for admin tracking.
 */

import { kv } from '@vercel/kv';

// Admin password for protected endpoints
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'rocket@admin2024';

interface TrackedUser {
    fbId: string;
    fbName: string;
    profilePicture: string;
    connectedAt: string;
    tokenExpiresAt?: string;
    adAccountId: string;
    adAccountName: string;
    lastActive: string;
}

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            fbId,
            fbName,
            profilePicture,
            tokenExpiresAt,
            adAccountId,
            adAccountName
        } = req.body;

        if (!fbId || !fbName) {
            return res.status(400).json({ error: 'Missing required fields: fbId, fbName' });
        }

        const now = new Date().toISOString();

        // Check if user already exists
        const existingUser = await kv.hget<TrackedUser>('users', fbId);

        const userData: TrackedUser = {
            fbId,
            fbName,
            profilePicture: profilePicture || '',
            connectedAt: existingUser?.connectedAt || now, // Keep original connect date
            tokenExpiresAt,
            adAccountId: adAccountId || '',
            adAccountName: adAccountName || '',
            lastActive: now
        };

        // Store user in hash (users -> fbId -> userData)
        await kv.hset('users', { [fbId]: userData });

        // Also add to user list for easy retrieval
        await kv.sadd('user_ids', fbId);

        console.log(`User logged: ${fbName} (${fbId})`);

        return res.status(200).json({
            success: true,
            message: 'User logged successfully',
            isNewUser: !existingUser
        });

    } catch (error: any) {
        console.error('Log User Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
