/**
 * Save Analysis History API
 * Stores top 3 ads from each analysis for upscale recommendation tracking
 * 
 * POST /api/save-analysis-history
 * Body: { businessName, adAccountId, topAds: [{id, name, rank}] }
 */

const HISTORY_KEY = 'ar_analysis_history';

interface TopAdEntry {
    id: string;
    name: string;
    rank: number; // 1, 2, or 3
}

interface AnalysisHistoryRecord {
    date: string; // YYYY-MM-DD
    businessName: string;
    adAccountId: string;
    topAds: TopAdEntry[];
}

// Store history in a simple JSON format (can be upgraded to Supabase later)
function getHistory(): AnalysisHistoryRecord[] {
    if (typeof globalThis !== 'undefined' && (globalThis as any).__analysisHistory) {
        return (globalThis as any).__analysisHistory;
    }
    return [];
}

function saveHistory(records: AnalysisHistoryRecord[]): void {
    (globalThis as any).__analysisHistory = records;
}

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET: Check for upscale candidates (ads in top 3 for 3 consecutive days)
    if (req.method === 'GET') {
        const { businessName, adAccountId } = req.query;

        if (!businessName || !adAccountId) {
            return res.status(400).json({ error: 'Missing businessName or adAccountId' });
        }

        const history = getHistory();
        const today = new Date();

        // Get last 3 days of records for this account
        const last3Days: string[] = [];
        for (let i = 0; i < 3; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            last3Days.push(d.toISOString().split('T')[0]);
        }

        const relevantRecords = history.filter(
            r => r.adAccountId === adAccountId && last3Days.includes(r.date)
        );

        if (relevantRecords.length < 3) {
            return res.status(200).json({
                success: true,
                candidates: [],
                message: 'Not enough historical data (need 3 consecutive days)'
            });
        }

        // Find ads that appear in top 1-3 for all 3 days
        const adCounts: Record<string, { name: string; days: string[] }> = {};

        for (const record of relevantRecords) {
            for (const ad of record.topAds) {
                if (!adCounts[ad.id]) {
                    adCounts[ad.id] = { name: ad.name, days: [] };
                }
                if (!adCounts[ad.id].days.includes(record.date)) {
                    adCounts[ad.id].days.push(record.date);
                }
            }
        }

        // Find ads present in all 3 days
        const candidates = Object.entries(adCounts)
            .filter(([_, data]) => data.days.length >= 3)
            .map(([id, data]) => ({ id, name: data.name, consecutiveDays: data.days.length }));

        return res.status(200).json({
            success: true,
            candidates,
            message: candidates.length > 0
                ? `Found ${candidates.length} ads in top 3 for 3+ consecutive days`
                : 'No ads qualified for upscale recommendation'
        });
    }

    // POST: Save today's analysis history
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { businessName, adAccountId, topAds } = req.body;

        if (!businessName || !adAccountId || !topAds) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const today = new Date().toISOString().split('T')[0];
        const history = getHistory();

        // Remove any existing record for today (overwrite)
        const filteredHistory = history.filter(
            r => !(r.date === today && r.adAccountId === adAccountId)
        );

        // Add new record
        const newRecord: AnalysisHistoryRecord = {
            date: today,
            businessName,
            adAccountId,
            topAds: topAds.map((ad: any, index: number) => ({
                id: ad.id,
                name: ad.name,
                rank: index + 1
            }))
        };

        filteredHistory.push(newRecord);

        // Keep only last 7 days of history
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

        const cleanedHistory = filteredHistory.filter(r => r.date >= cutoffDate);
        saveHistory(cleanedHistory);

        // Check for upscale candidates
        const candidates = await checkUpscaleCandidates(adAccountId, cleanedHistory);

        return res.status(200).json({
            success: true,
            message: 'Analysis history saved',
            upscaleCandidates: candidates
        });

    } catch (error: any) {
        console.error('[Save History] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

// Check for ads in top 3 for 3 consecutive days
async function checkUpscaleCandidates(adAccountId: string, history: AnalysisHistoryRecord[]) {
    const today = new Date();
    const last3Days: string[] = [];

    for (let i = 0; i < 3; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        last3Days.push(d.toISOString().split('T')[0]);
    }

    const relevantRecords = history.filter(
        r => r.adAccountId === adAccountId && last3Days.includes(r.date)
    );

    if (relevantRecords.length < 3) {
        return [];
    }

    // Find ads that appear in top 1-3 for all 3 days
    const adCounts: Record<string, { name: string; days: string[] }> = {};

    for (const record of relevantRecords) {
        for (const ad of record.topAds) {
            if (!adCounts[ad.id]) {
                adCounts[ad.id] = { name: ad.name, days: [] };
            }
            if (!adCounts[ad.id].days.includes(record.date)) {
                adCounts[ad.id].days.push(record.date);
            }
        }
    }

    return Object.entries(adCounts)
        .filter(([_, data]) => data.days.length >= 3)
        .map(([id, data]) => ({ id, name: data.name }));
}
