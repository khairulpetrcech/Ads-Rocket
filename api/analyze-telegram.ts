import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { topAds, telegramChatId, telegramBotToken } = req.body;

        if (!topAds || !Array.isArray(topAds) || topAds.length === 0) {
            return res.status(400).json({ error: 'No ads data provided' });
        }

        if (!telegramChatId || !telegramBotToken) {
            return res.status(400).json({ error: 'Telegram credentials not configured' });
        }

        // Get Gemini 3.0 Pro API key from environment
        const geminiApiKey = process.env.GEMINI_3_API;
        if (!geminiApiKey) {
            return res.status(500).json({ error: 'GEMINI_3_API not configured in environment' });
        }

        // Format ads data for analysis
        const adDetails = topAds.map((ad: any, i: number) => `
Ad ${i + 1}: "${ad.name}"
- ROAS: ${ad.metrics?.roas?.toFixed(2) || 'N/A'}
- Spend: RM ${ad.metrics?.spend?.toFixed(2) || '0'}
- CTR: ${ad.metrics?.ctr?.toFixed(2) || '0'}%
- Purchases: ${ad.metrics?.purchases || 0}
        `).join('\n');

        const prompt = `
You are a Meta Ads performance analyst. Analyze these winning ads and provide insights.

Top Performing Ads:
${adDetails}

Task:
1. Identify the winning ad and explain WHY it's performing well
2. Give 3 actionable recommendations to scale this winning ad
3. Compare performance between the ads

Format your response in a clear, easy-to-read format suitable for Telegram message.
Use emojis to make it engaging. Keep it concise but insightful.
Start with "🏆 *Winning Ad Analysis*" as the header.
Use *bold* for important points (Telegram Markdown format).
        `;

        // Call Gemini 3.0 Pro
        const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
        const result = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt
        });

        const analysisText = result.text || 'Unable to generate analysis.';

        // Send to Telegram
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
            console.error('Telegram API error:', telegramData);
            return res.status(400).json({
                error: 'Failed to send Telegram message',
                telegramError: telegramData.description
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Analysis sent to Telegram successfully',
            analysis: analysisText
        });

    } catch (error: any) {
        console.error('Error in analyze-and-send:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
