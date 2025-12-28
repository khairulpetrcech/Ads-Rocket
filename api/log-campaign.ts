/**
 * API endpoint to log campaign creation.
 * Stores campaign data in Vercel KV for admin tracking.
 */

import { kv } from '@vercel/kv';

interface TrackedCampaign {
    id: string;
    fbUserId: string;
    fbUserName: string;
    campaignName: string;
    objective: string;
    mediaType: 'IMAGE' | 'VIDEO';
    adAccountId: string;
    createdAt: string;
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
            fbUserId,
            fbUserName,
            campaignName,
            objective,
            mediaType,
            adAccountId
        } = req.body;

        if (!fbUserId || !campaignName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const now = new Date().toISOString();
        const campaignId = `${fbUserId}_${Date.now()}`;

        const campaignData: TrackedCampaign = {
            id: campaignId,
            fbUserId,
            fbUserName: fbUserName || 'Unknown',
            campaignName,
            objective: objective || 'OUTCOME_SALES',
            mediaType: mediaType || 'IMAGE',
            adAccountId: adAccountId || '',
            createdAt: now
        };

        // Store campaign in hash
        await kv.hset('campaigns', { [campaignId]: campaignData });

        // Add to campaign list
        await kv.sadd('campaign_ids', campaignId);

        // Increment user's campaign count
        await kv.hincrby('user_campaign_counts', fbUserId, 1);

        // Update user's last active time
        const existingUser = await kv.hget<any>('users', fbUserId);
        if (existingUser) {
            await kv.hset('users', {
                [fbUserId]: { ...existingUser, lastActive: now }
            });
        }

        console.log(`Campaign logged: ${campaignName} by ${fbUserName}`);

        return res.status(200).json({
            success: true,
            message: 'Campaign logged successfully',
            campaignId
        });

    } catch (error: any) {
        console.error('Log Campaign Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
