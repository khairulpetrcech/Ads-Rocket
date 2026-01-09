/**
 * Telegram Webhook Handler for Upscale Callback
 * Handles inline keyboard button presses for upscale yes/no
 * 
 * POST /api/telegram-webhook
 * Body: Telegram Update object with callback_query
 */

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
        const update = req.body;

        // Handle callback query (button press)
        if (update.callback_query) {
            const callbackQuery = update.callback_query;
            const callbackData = callbackQuery.data;
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;

            // Parse callback data: upscale_yes_{adId} or upscale_no_{adId}
            if (callbackData.startsWith('upscale_yes_')) {
                const adId = callbackData.replace('upscale_yes_', '');

                // TODO: Implement actual upscale via Meta API
                // For now, send confirmation message
                const botToken = process.env.TELEGRAM_BOT_TOKEN;

                if (botToken) {
                    // Answer callback to remove loading state
                    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            callback_query_id: callbackQuery.id,
                            text: '✅ Upscale request received!'
                        })
                    });

                    // Edit message to show confirmation
                    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            message_id: messageId,
                            text: `✅ *Upscale Confirmed*\n\nAds ID: ${adId}\n\n⚠️ Upscale 20% budget akan dilaksanakan.\n\n_Nota: Feature ini dalam pembangunan. Sila upscale secara manual buat masa ini._`,
                            parse_mode: 'Markdown'
                        })
                    });
                }

                return res.status(200).json({ success: true, action: 'upscale_confirmed', adId });
            }

            if (callbackData.startsWith('upscale_no_')) {
                const adId = callbackData.replace('upscale_no_', '');
                const botToken = process.env.TELEGRAM_BOT_TOKEN;

                if (botToken) {
                    // Answer callback
                    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            callback_query_id: callbackQuery.id,
                            text: 'Okay, tidak upscale.'
                        })
                    });

                    // Edit message
                    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            message_id: messageId,
                            text: `❌ *Upscale Dibatalkan*\n\nAds ini tidak akan di-upscale.\n\n_Anda boleh upscale secara manual jika diperlukan._`,
                            parse_mode: 'Markdown'
                        })
                    });
                }

                return res.status(200).json({ success: true, action: 'upscale_cancelled', adId });
            }
        }

        // Default response for other updates
        return res.status(200).json({ success: true, message: 'Update received' });

    } catch (error: any) {
        console.error('[Telegram Webhook] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
