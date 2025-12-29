import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { chatId, message, botToken } = req.body;

        if (!chatId || !message || !botToken) {
            return res.status(400).json({ error: 'Missing required fields: chatId, message, botToken' });
        }

        // Send message via Telegram Bot API
        const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

        const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Telegram API error:', data);
            return res.status(400).json({
                error: data.description || 'Failed to send Telegram message',
                details: data
            });
        }

        return res.status(200).json({
            success: true,
            message_id: data.result?.message_id
        });

    } catch (error: any) {
        console.error('Error sending Telegram message:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
