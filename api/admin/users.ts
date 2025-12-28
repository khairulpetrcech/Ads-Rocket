/**
 * Admin API to get all connected users.
 * Protected with admin password.
 */

import { kv } from '@vercel/kv';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'rocket@admin2024';

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check admin authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Get all user IDs
        const userIds = await kv.smembers('user_ids');

        if (!userIds || userIds.length === 0) {
            return res.status(200).json({
                users: [],
                total: 0
            });
        }

        // Get all users data
        const users: any[] = [];
        for (const id of userIds) {
            const userData = await kv.hget('users', id as string);
            if (userData) {
                // Get campaign count for this user
                const campaignCount = await kv.hget('user_campaign_counts', id as string) || 0;
                users.push({ ...userData, campaignCount });
            }
        }

        // Sort by lastActive descending
        users.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());

        return res.status(200).json({
            users,
            total: users.length
        });

    } catch (error: any) {
        console.error('Get Users Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
