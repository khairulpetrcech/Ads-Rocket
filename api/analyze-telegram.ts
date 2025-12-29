import { GoogleGenAI } from "@google/genai";

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
        const { adAccountId, fbAccessToken, telegramChatId, telegramBotToken } = req.body;

        if (!adAccountId || !fbAccessToken) {
            return res.status(400).json({ error: 'Missing Meta Ads credentials' });
        }

        if (!telegramChatId || !telegramBotToken) {
            return res.status(400).json({ error: 'Telegram credentials not configured' });
        }

        const geminiApiKey = process.env.GEMINI_3_API;
        if (!geminiApiKey) {
            return res.status(500).json({ error: 'GEMINI_3_API not configured' });
        }

        // --- STEP 1: Fetch Top Ads from Meta API (last 4 days) ---
        const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

        // Calculate date range: last 4 days
        const today = new Date();
        const fourDaysAgo = new Date(today);
        fourDaysAgo.setDate(today.getDate() - 3);

        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        const timeRange = JSON.stringify({
            since: formatDate(fourDaysAgo),
            until: formatDate(today)
        });

        const insightsQuery = `insights.time_range(${timeRange}){spend,impressions,clicks,cpc,ctr,actions,action_values}`;
        const fields = ['id', 'name', 'status', 'effective_status', insightsQuery].join(',');
        const filtering = `[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]`;

        const metaUrl = `https://graph.facebook.com/v19.0/${actId}/ads?fields=${fields}&access_token=${fbAccessToken}&limit=50&filtering=${filtering}`;

        const metaResponse = await fetch(metaUrl);
        const metaData = await metaResponse.json();

        if (metaData.error) {
            console.error('Meta API error:', metaData.error);
            return res.status(400).json({ error: metaData.error.message || 'Failed to fetch ads' });
        }

        // Parse ads and calculate metrics
        const ads = (metaData.data || []).map((ad: any) => {
            const insights = ad.insights?.data?.[0] || {};
            const spend = parseFloat(insights.spend || '0');
            const purchaseAction = insights.actions?.find((a: any) => a.action_type === 'purchase')?.value || 0;
            const purchaseValue = insights.action_values?.find((a: any) => a.action_type === 'purchase')?.value || 0;
            const revenue = parseFloat(purchaseValue || '0');
            const leads = insights.actions?.find((a: any) => a.action_type === 'lead')?.value || 0;
            const messages = insights.actions?.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0;

            return {
                name: ad.name,
                status: ad.effective_status || ad.status,
                spend,
                roas: spend > 0 ? (revenue / spend) : 0,
                ctr: parseFloat(insights.ctr || '0'),
                purchases: parseInt(purchaseAction),
                leads: parseInt(leads) + parseInt(messages),
                revenue
            };
        });

        // Filter only ads with spend and sort by ROAS
        const topAds = ads
            .filter((a: any) => a.spend > 0)
            .sort((a: any, b: any) => b.roas - a.roas || b.spend - a.spend)
            .slice(0, 5);

        if (topAds.length === 0) {
            // Send message that no ads found
            const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
            await fetch(telegramUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: telegramChatId,
                    text: '📊 *Tiada iklan aktif* dengan spend dalam 4 hari lepas.',
                    parse_mode: 'Markdown'
                })
            });
            return res.status(200).json({ success: true, message: 'No ads with spend found' });
        }

        // --- STEP 2: AI Analysis in Bahasa Malaysia ---
        const adDetails = topAds.map((ad: any, i: number) =>
            `${i + 1}. "${ad.name}" - Spend: RM${ad.spend.toFixed(2)}, ROAS: ${ad.roas.toFixed(2)}x, CTR: ${ad.ctr.toFixed(2)}%, Purchases: ${ad.purchases}, Leads: ${ad.leads}`
        ).join('\n');

        const prompt = `Kau seorang pakar Meta Ads Malaysia. Analisa iklan-iklan ini:

${adDetails}

Tugas:
1. Kenal pasti iklan TERBAIK dan jelaskan KENAPA ia perform
2. Beri 3 cadangan untuk scale iklan menang
3. Bandingkan prestasi antara iklan

Format: Bahasa Malaysia santai tapi profesional. Guna emoji. Mula dengan "🏆 *Analisis Iklan Menang*". Guna *bold* untuk poin penting. RINGKAS dalam 300 patah perkataan.`;

        const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
        const result = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                maxOutputTokens: 800
            }
        });

        const analysisText = result.text || 'Tidak dapat generate analisis.';

        // --- STEP 3: Send to Telegram ---
        const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
        const telegramResponse = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: telegramChatId,
                text: analysisText,
                parse_mode: 'Markdown'
            })
        });

        const telegramData = await telegramResponse.json();

        if (!telegramData.ok) {
            console.error('Telegram error:', telegramData);
            return res.status(400).json({
                error: 'Failed to send Telegram',
                telegramError: telegramData.description
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Analisis dihantar ke Telegram!',
            adsAnalyzed: topAds.length
        });

    } catch (error: any) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message || 'Internal error' });
    }
}
