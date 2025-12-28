/**
 * Admin API to get all campaigns.
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
        // Get query params for filtering
        const { userId, limit = '50', offset = '0' } = req.query;

        // Get all campaign IDs
        const campaignIds = await kv.smembers('campaign_ids');

        if (!campaignIds || campaignIds.length === 0) {
            return res.status(200).json({
                campaigns: [],
                total: 0
            });
        }

        // Get all campaigns data
        let campaigns: any[] = [];
        for (const id of campaignIds) {
            const campaignData = await kv.hget('campaigns', id as string);
            if (campaignData) {
                campaigns.push(campaignData);
            }
        }

        // Filter by userId if provided
        if (userId) {
            campaigns = campaigns.filter(c => c.fbUserId === userId);
        }

        // Sort by createdAt descending
        campaigns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const total = campaigns.length;

        // Apply pagination
        const start = parseInt(offset as string);
        const end = start + parseInt(limit as string);
        campaigns = campaigns.slice(start, end);

        return res.status(200).json({
            campaigns,
            total,
            hasMore: end < total
        });

    } catch (error: any) {
        console.error('Get Campaigns Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
