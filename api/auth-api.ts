import { createClient } from '@supabase/supabase-js';

const FB_APP_ID = '861724536220118';
const ALT_FB_TOKEN = process.env.ALT_FB_TOKEN;
const FB_APP_SECRET = process.env.FB_APP_SECRET;

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { action } = req.query;

    if (req.method === 'POST' && action === 'alt-login') {
        const { code } = req.body;
        if (!code || code.length !== 5) return res.status(400).json({ error: 'Sila masukkan 5 aksara terakhir token.' });
        if (!ALT_FB_TOKEN) return res.status(500).json({ error: 'ALT_FB_TOKEN tidak dijumpai di server ENV.' });

        const cleanToken = ALT_FB_TOKEN.trim();
        const last5 = cleanToken.slice(-5).toLowerCase();
        const inputCode = code.trim().toLowerCase();

        if (inputCode !== last5) {
            return res.status(401).json({ error: 'Kod salah. Sila semak semula.' });
        }

        try {
            const userRes = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${ALT_FB_TOKEN}&fields=id,name,picture.type(large)`);
            const userData = await userRes.json();
            if (userData.error) return res.status(400).json({ error: 'Token tidak sah.', details: userData.error });

            const accountsRes = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?access_token=${ALT_FB_TOKEN}&fields=id,name,account_id,currency`);
            const accountsData = await accountsRes.json();
            if (accountsData.error) return res.status(400).json({ error: 'Gagal dapatkan akaun.', details: accountsData.error });

            return res.status(200).json({
                success: true,
                accessToken: ALT_FB_TOKEN,
                userData: { id: userData.id, name: userData.name, picture: userData.picture?.data?.url || '' },
                adAccounts: accountsData.data || []
            });
        } catch (error: any) {
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    if (req.method === 'POST' && action === 'exchange-token') {
        const { shortLivedToken } = req.body;
        if (!shortLivedToken) return res.status(400).json({ error: 'Missing shortLivedToken' });
        if (!FB_APP_SECRET) return res.status(500).json({ error: 'App secret not configured' });

        try {
            const exchangeUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&fb_exchange_token=${shortLivedToken}`;
            const response = await fetch(exchangeUrl);
            const data = await response.json();

            if (data.error) return res.status(400).json({ error: data.error.message || 'Failed to exchange token', code: data.error.code });
            if (!data.access_token) return res.status(400).json({ error: 'No access token in response' });

            const expiresIn = data.expires_in || 5184000;
            const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

            return res.status(200).json({
                access_token: data.access_token,
                token_type: data.token_type || 'bearer',
                expires_in: expiresIn,
                expires_at: expiresAt
            });
        } catch (error: any) {
            return res.status(500).json({ error: error.message || 'Internal server error' });
        }
    }

    return res.status(404).json({ error: 'Not found or invalid action' });
}
