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

        // --- STEP 1: Fetch Account Name and Top Ads with Creatives from Meta API (last 4 days) ---
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

        // 1b. Fetch Ads Insights WITH Creative Data
        const insightsQuery = `insights.time_range(${timeRange}){spend,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type}`;
        const creativeFields = 'creative{thumbnail_url,image_url,object_story_spec}';
        const fields = ['id', 'name', 'status', 'effective_status', creativeFields, insightsQuery].join(',');
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

            // Get CPA (Cost Per Purchase)
            const cpaData = insights.cost_per_action_type?.find((a: any) => a.action_type === 'purchase');
            const cpa = cpaData ? parseFloat(cpaData.value) : (parseInt(purchaseAction) > 0 ? spend / parseInt(purchaseAction) : 0);

            // Get creative image URL
            const imageUrl = ad.creative?.thumbnail_url || ad.creative?.image_url || null;

            return {
                id: ad.id,
                name: ad.name,
                status: ad.effective_status || ad.status,
                spend,
                roas: spend > 0 ? (revenue / spend) : 0,
                ctr: parseFloat(insights.ctr || '0'),
                purchases: parseInt(purchaseAction),
                leads: parseInt(leads) + parseInt(messages),
                revenue,
                cpa,
                imageUrl
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

        // --- STEP 2: Fetch Creative Images for Multimodal Analysis ---
        const imageContents: any[] = [];

        for (const ad of topAds) {
            if (ad.imageUrl) {
                try {
                    console.log(`Fetching image for ad: ${ad.name}`);
                    const imageResponse = await fetch(ad.imageUrl);
                    const imageBuffer = await imageResponse.arrayBuffer();
                    const base64Image = Buffer.from(imageBuffer).toString('base64');
                    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

                    imageContents.push({
                        adName: ad.name,
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Image
                        }
                    });
                } catch (imgErr) {
                    console.warn(`Failed to fetch image for ${ad.name}:`, imgErr);
                }
            }
        }

        console.log(`Fetched ${imageContents.length} ad images for multimodal analysis`);

        // --- STEP 3: AI Multimodal Analysis with Gemini ---
        const adDetails = topAds.map((ad: any, i: number) =>
            `${i + 1}. "${ad.name}" - Spend: RM${ad.spend.toFixed(2)}, ROAS: ${ad.roas.toFixed(2)}x, CPA: RM${ad.cpa.toFixed(2)}, Purchase: ${ad.purchases}`
        ).join('\n');

        // Build multimodal content array
        const contentParts: any[] = [];

        // Add instruction text first
        contentParts.push({
            text: `Kau seorang pakar Meta Ads Malaysia. Analisa VISUAL iklan dan data prestasi untuk Ads Manager "${accountName}" bagi tempoh 4 hari lepas (${startDateMY} - ${endDateMY}).

Data Prestasi Iklan:
${adDetails}

Di bawah adalah gambar/thumbnail untuk setiap iklan. Analisa VISUAL setiap creative dengan teliti.`
        });

        // Add images with labels
        for (let i = 0; i < imageContents.length; i++) {
            contentParts.push({
                text: `\n\n--- Creative ${i + 1}: "${imageContents[i].adName}" ---`
            });
            contentParts.push({
                inlineData: imageContents[i].inlineData
            });
        }

        // Add final prompt
        contentParts.push({
            text: `

Berdasarkan VISUAL creatives di atas dan data prestasi, hasilkan laporan mengikut format TEPAT (Bahasa Malaysia):

📊 *Report : ${accountName}*
past 4 Days
(${startDateMY} - ${endDateMY})

*3 Win Ad :*
1) [Nama Ad 1] | ROAS : [Nilai]x | CPA : RM[Nilai] | Purchase : [Nilai]
2) [Nama Ad 2] | ROAS : [Nilai]x | CPA : RM[Nilai] | Purchase : [Nilai]
3) [Nama Ad 3] | ROAS : [Nilai]x | CPA : RM[Nilai] | Purchase : [Nilai]

*Kenapa Iklan Ini Win?*
1) [Nama Ad 1] - [Analisa VISUAL: Warna dominan, komposisi gambar, elemen visual menarik, first 3 second hook, teks/headline yang stand out, emosi yang dipancarkan oleh visual.]
2) [Nama Ad 2] - [Analisa VISUAL berdasarkan apa yang kau NAMPAK dalam gambar tersebut.]
3) [Nama Ad 3] - [Analisa VISUAL yang specific dan detailed.]

*Overall Campaign Analysis :* [Analisis keseluruhan prestasi dalam 20 patah perkataan.]

PENTING:
- Guna format Markdown Telegram (*bold* untuk tajuk).
- Jangan tambah intro atau outro.
- Analisa berdasarkan APA YANG KAU NAMPAK dalam gambar - warna, teks, produk, model, komposisi, dll.
- Nyatakan elemen visual SPECIFIC yang membuat iklan ini perform.
- Include CPA dalam report.`
        });

        console.log('Calling Gemini API with multimodal content...');
        const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

        const response = await genAI.models.generateContent({
            model: 'gemini-2.0-flash', // Flash model supports multimodal
            contents: contentParts
        });

        const analysisText = response.text || 'Tidak dapat generate analisis.';
        console.log('Gemini multimodal response received');

        // --- STEP 4: Send to Telegram ---
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
            message: 'Analisis multimodal dihantar ke Telegram!',
            adsAnalyzed: topAds.length,
            imagesAnalyzed: imageContents.length
        });

    } catch (error: any) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message || 'Internal error' });
    }
}
