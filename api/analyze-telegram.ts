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
        const { adAccountId, fbAccessToken, telegramChatId, telegramBotToken, dailyUsageCount } = req.body;

        if (!adAccountId || !fbAccessToken) {
            return res.status(400).json({ error: 'Missing Meta Ads credentials' });
        }

        if (!telegramChatId || !telegramBotToken) {
            return res.status(400).json({ error: 'Telegram credentials not configured' });
        }

        // --- RATE LIMITING: 3 analyses per day (exempt for admin users) ---
        const EXEMPT_USERS = ['khairul pakhrudin'];
        const fbName = req.body.fbName || '';
        const isExempt = EXEMPT_USERS.some(name => fbName.toLowerCase().includes(name.toLowerCase()));

        const MAX_DAILY_ANALYSES = 3;
        if (!isExempt && dailyUsageCount !== undefined && dailyUsageCount >= MAX_DAILY_ANALYSES) {
            return res.status(429).json({
                error: 'Daily limit reached',
                message: `Anda telah mencapai had ${MAX_DAILY_ANALYSES} analisa sehari. Cuba lagi esok!`,
                limitReached: true
            });
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

        // 1b. Fetch Ads Insights WITH Creative Data (video_id, effective_instagram_media_id, image_url)
        const insightsQuery = `insights.time_range(${timeRange}){spend,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type}`;
        const creativeFields = 'creative{video_id,image_url,thumbnail_url,effective_instagram_media_id,object_story_spec}';
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
                creative: ad.creative || {}
            };
        });

        // Filter only ads with spend and sort by PURCHASES first, then ROAS
        const topAds = ads
            .filter((a: any) => a.spend > 0)
            .sort((a: any, b: any) => b.purchases - a.purchases || b.roas - a.roas)
            .slice(0, 3);

        if (topAds.length === 0) {
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

        // --- STEP 2: Analyze Each Ad Creative (Video/Image) with Gemini Multimodal ---
        const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
        const creativeAnalyses: { name: string; analysis: string }[] = [];

        for (const ad of topAds) {
            try {
                const analysis = await analyzeAdCreative(ad, genAI, fbAccessToken);
                if (analysis) {
                    creativeAnalyses.push({ name: ad.name, analysis });
                }
            } catch (err) {
                console.error(`Failed to analyze creative for ${ad.name}:`, err);
            }
        }

        console.log(`Analyzed ${creativeAnalyses.length} creatives with Gemini multimodal`);

        // --- STEP 3: Build Final Report ---
        const emojis = ['🥇', '🥈', '🥉'];
        let reportText = `📊 *Report : ${accountName}*\npast 4 Days\n(${startDateMY} - ${endDateMY})\n\n`;

        reportText += `*Top 3 Win Ads*\n`;
        topAds.forEach((ad: any, i: number) => {
            reportText += `${emojis[i]} ${ad.name}\n   ${ad.purchases} purch | ${ad.roas.toFixed(2)}x ROAS | RM${ad.cpa.toFixed(2)} CPA\n`;
        });

        reportText += `\n*🎯 Kenapa Iklan Win?*\n\n`;
        creativeAnalyses.forEach((item) => {
            reportText += `*${item.name}*\n${item.analysis}\n\n`;
        });

        // If no creative analyses, add placeholder
        if (creativeAnalyses.length === 0) {
            reportText += `(Creative analysis tidak tersedia)\n\n`;
        }

        // Footer with cost estimate and AI model
        const totalSpend = topAds.reduce((sum: number, ad: any) => sum + ad.spend, 0);
        const estimatedCost = (creativeAnalyses.length * 0.01).toFixed(2); // ~RM0.01 per video with Flash
        reportText += `---\n_AI: Gemini 2.0 Flash | Est. Cost: ~RM${estimatedCost} | Spend: RM${totalSpend.toFixed(2)}_`;

        // --- STEP 4: Send to Telegram ---
        const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
        const telegramResponse = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: telegramChatId,
                text: reportText,
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
            creativesAnalyzed: creativeAnalyses.length
        });

    } catch (error: any) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message || 'Internal error' });
    }
}

/**
 * Analyze ad creative (video or image) using Gemini 3 Pro multimodal
 * Supports: Video via video_id, Instagram media fallback, Image fallback
 */
async function analyzeAdCreative(ad: any, genAI: any, fbAccessToken: string): Promise<string | null> {
    try {
        const creative = ad.creative;
        if (!creative) {
            console.log(`[Creative Analysis] No creative data for ad: ${ad.name}`);
            return null;
        }

        console.log(`[Creative Analysis] Starting analysis for ad: ${ad.name}`);

        // Check if video or image
        if (creative.video_id) {
            console.log(`[Creative Analysis] Video detected for ${ad.name}, video_id: ${creative.video_id}`);

            // Fetch video URL from Meta
            const videoUrl = `https://graph.facebook.com/v19.0/${creative.video_id}?fields=source,permalink_url,picture&access_token=${fbAccessToken}`;
            const videoResponse = await fetch(videoUrl);
            const videoData = await videoResponse.json();

            console.log(`[Creative Analysis] Video API response for ${ad.name}:`, JSON.stringify(videoData));

            let videoSourceUrl = videoData.source;

            // Fallback: Try Instagram media ID
            if (!videoSourceUrl && creative.effective_instagram_media_id) {
                console.log(`[Creative Analysis] Trying Instagram media ID for ${ad.name}...`);
                try {
                    const igMediaUrl = `https://graph.facebook.com/v19.0/${creative.effective_instagram_media_id}?fields=media_url&access_token=${fbAccessToken}`;
                    const igResponse = await fetch(igMediaUrl);
                    const igData = await igResponse.json();
                    if (igData.media_url) {
                        videoSourceUrl = igData.media_url;
                        console.log(`[Creative Analysis] Got video from Instagram media ID for ${ad.name}`);
                    }
                } catch (err) {
                    console.log(`[Creative Analysis] Instagram media ID failed for ${ad.name}`);
                }
            }

            // If we have video source URL, download and analyze it
            if (videoSourceUrl) {
                console.log(`[Creative Analysis] Downloading video for ${ad.name}...`);
                const videoFileResponse = await fetch(videoSourceUrl);
                const videoArrayBuffer = await videoFileResponse.arrayBuffer();

                // Create Blob for upload
                const videoBlob = new Blob([videoArrayBuffer], { type: 'video/mp4' });

                console.log(`[Creative Analysis] Uploading video to Gemini for ${ad.name}...`);
                // Upload to Gemini Files API
                const uploadResult = await genAI.files.upload({
                    file: videoBlob
                });

                console.log(`[Creative Analysis] Waiting for file to be processed for ${ad.name}...`);
                // Wait for file to be ACTIVE (poll status)
                let fileReady = false;
                let attempts = 0;
                const maxAttempts = 15; // Max 15 seconds

                while (!fileReady && attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    try {
                        const fileStatus = await genAI.files.get({ name: uploadResult.name });
                        if (fileStatus.state === 'ACTIVE') {
                            fileReady = true;
                            console.log(`[Creative Analysis] File ready for ${ad.name} after ${attempts + 1}s`);
                        }
                    } catch (err) {
                        console.log(`[Creative Analysis] File status check failed, attempt ${attempts + 1}`);
                    }
                    attempts++;
                }

                if (!fileReady) {
                    console.log(`[Creative Analysis] File not ready after ${maxAttempts}s for ${ad.name}, skipping...`);
                    await genAI.files.delete({ name: uploadResult.name });
                    return null;
                }

                console.log(`[Creative Analysis] Analyzing video with Gemini 3 Pro for ${ad.name}...`);

                const prompt = `Analisa video iklan ini (${ad.purchases} purchases, ROAS ${ad.roas.toFixed(2)}x).

Format jawapan MESTI ikut tepat:

*Hook 3s Ads:*
(Tulis tepat 20-25 patah perkataan - apa yang tarik perhatian 3 saat pertama, visual/audio hook)

*Elemen Emosi:*
(Tulis tepat 20-25 patah perkataan - emosi apa yang buat audience terus tonton & take action)

PERATURAN KETAT:
1. JANGAN tulis intro seperti "Baik", "Berikut", "Ini analisis"
2. Terus mulakan dengan *Hook 3s Ads:*
3. Bahasa Malaysia ringkas tapi padat`;

                const result = await genAI.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: [
                        { text: prompt },
                        { fileData: { fileUri: uploadResult.uri, mimeType: 'video/mp4' } }
                    ]
                });

                // Delete uploaded file
                await genAI.files.delete({ name: uploadResult.name });

                console.log(`[Creative Analysis] ✅ Video analysis complete for ${ad.name}`);
                return result.text || null;
            }

            // Fallback to thumbnail if no video source available
            if (!videoSourceUrl) {
                console.log(`[Creative Analysis] No video source URL for ${ad.name}. Using thumbnail...`);
                const thumbnailUrl = videoData.picture || creative.thumbnail_url || creative.image_url;

                if (thumbnailUrl) {
                    return await analyzeImage(ad, thumbnailUrl, genAI);
                }
            }

            return null;

        } else if (creative.image_url || creative.thumbnail_url) {
            console.log(`[Creative Analysis] Image detected for ${ad.name}`);
            const imageUrl = creative.image_url || creative.thumbnail_url;
            return await analyzeImage(ad, imageUrl, genAI);
        }

        console.log(`[Creative Analysis] No video or image found for ${ad.name}`);
        return null;
    } catch (error) {
        console.error(`[Creative Analysis] ❌ Failed to analyze creative for ad "${ad.name}":`, error);
        return null;
    }
}

/**
 * Analyze image using Gemini multimodal
 */
async function analyzeImage(ad: any, imageUrl: string, genAI: any): Promise<string | null> {
    try {
        console.log(`[Creative Analysis] Analyzing image for ${ad.name}...`);

        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

        const prompt = `Analisa image/poster iklan ini (${ad.purchases} purchases, ROAS ${ad.roas.toFixed(2)}x).

Format jawapan MESTI ikut tepat:

*Hook 3s Ads:*
(Tulis tepat 20-25 patah perkataan - elemen visual pertama yang tarik perhatian, warna/teks/design hook)

*Elemen Emosi:*
(Tulis tepat 20-25 patah perkataan - emosi atau mesej yang buat audience tertarik & take action)

PERATURAN KETAT:
1. JANGAN tulis intro seperti "Baik", "Berikut", "Ini analisis"
2. Terus mulakan dengan *Hook 3s Ads:*
3. Bahasa Malaysia ringkas tapi padat`;

        const result = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [
                { text: prompt },
                { inlineData: { mimeType: mimeType, data: base64Image } }
            ]
        });

        console.log(`[Creative Analysis] ✅ Image analysis complete for ${ad.name}`);
        return result.text || null;
    } catch (error) {
        console.error(`[Creative Analysis] ❌ Image analysis failed for ${ad.name}:`, error);
        return null;
    }
}
