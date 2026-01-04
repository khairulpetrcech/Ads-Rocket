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

        // --- STEP 1: Fetch Account Name and Top Ads from Meta API (last 4 days) ---
        const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

        // Calculate date range: last 4 days
        const today = new Date();
        const fourDaysAgo = new Date(today);
        fourDaysAgo.setDate(today.getDate() - 3);

        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        const formatDateMY = (d: Date) => {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}/${month}/${year}`;
        };

        const startDateStr = formatDate(fourDaysAgo);
        const endDateStr = formatDate(today);
        const startDateMY = formatDateMY(fourDaysAgo);
        const endDateMY = formatDateMY(today);

        const timeRange = JSON.stringify({
            since: startDateStr,
            until: endDateStr
        });

        // 1a. Fetch Account Name
        const accountInfoUrl = `https://graph.facebook.com/v19.0/${actId}?fields=name&access_token=${fbAccessToken}`;
        const accountInfoResponse = await fetch(accountInfoUrl);
        const accountInfo = await accountInfoResponse.json();
        const accountName = accountInfo.name || adAccountId;

        // 1b. Fetch Ads Insights
        const insightsQuery = `insights.time_range(${timeRange}){spend,impressions,clicks,cpc,ctr,actions,action_values}`;
        const fields = ['id', 'name', 'status', 'effective_status', insightsQuery].join(',');
        const filtering = encodeURIComponent(`[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]`);

        const metaUrl = `https://graph.facebook.com/v19.0/${actId}/ads?fields=${encodeURIComponent(fields)}&access_token=${fbAccessToken}&limit=50&filtering=${filtering}`;

        console.log(`Fetching Meta API for ${accountName}...`);
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
            .slice(0, 3);

        if (topAds.length === 0) {
            // Send message that no ads found
            const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
            await fetch(telegramUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: telegramChatId,
                    text: `📊 *Report : ${accountName}*\n\npast 4 Days\n(${startDateMY} - ${endDateMY})\n\nTiada iklan aktif dengan spend dalam 4 hari lepas.`,
                    parse_mode: 'Markdown'
                })
            });
            return res.status(200).json({ success: true, message: 'No ads with spend found' });
        }

        // --- STEP 2: AI Analysis in Bahasa Malaysia with New Template ---
        const adDetails = topAds.map((ad: any, i: number) =>
            `${i + 1}. "${ad.name}" - Spend: RM${ad.spend.toFixed(2)}, ROAS: ${ad.roas.toFixed(2)}x, Purchase: ${ad.purchases}`
        ).join('\n');

        const prompt = `Kau seorang pakar Meta Ads Malaysia. Analisa data iklan untuk Ads Manager "${accountName}" bagi tempoh 4 hari lepas (${startDateMY} - ${endDateMY}).

Data Iklan:
${adDetails}

Sila hasilkan laporan mengikut format TEPAT di bawah (Bahasa Malaysia):

Report : ${accountName}
past 4 Days
(${startDateMY} - ${endDateMY})

3 Win Ad :
1) [Nama Ad 1] | ROAS : [Nilai] | Total Purchase : [Nilai]
2) [Nama Ad 2] | ROAS : [Nilai] | Total Purchase : [Nilai]
3) [Nama Ad 3] | ROAS : [Nilai] | Total Purchase : [Nilai]

Kenapa Iklan Ini Win?
1) [Nama Ad 1] - [Analisa: Overall flow video/image + elemen emosi + first 3 second hook yang menarik perhatian audience.]
2) [Nama Ad 2] - [Analisa: Overall flow video/image + elemen emosi + first 3 second hook.]
3) [Nama Ad 3] - [Analisa: Overall flow video/image + elemen emosi + first 3 second hook.]

Overall Campaign Analysis : [Analisis keseluruhan akaun dalam 20 patah perkataan sahaja.]

PENTING: 
- Guna format Markdown Telegram (*bold* untuk tajuk). 
- Jangan tambah intro atau outro.
- Fokus pada FLOW visual dan HOOK 3 saat pertama, BUKAN suasana suram/lemau/mood.
- Analisa kenapa ads tu dapat hooked audience.`;

        console.log('Calling Gemini API...');
        const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
        const response = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt
        });

        const analysisText = response.text || 'Tidak dapat generate analisis.';
        console.log('Gemini response received');

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
