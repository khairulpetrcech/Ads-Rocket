
import { MetaAdAccount } from '../src/types';

const FB_APP_ID = '861724536220118';
const ALT_FB_TOKEN = process.env.ALT_FB_TOKEN;

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

    const { code } = req.body;

    if (!code || code.length !== 5) {
        return res.status(400).json({ error: 'Sila masukkan 5 aksara terakhir token.' });
    }

    if (!ALT_FB_TOKEN) {
        return res.status(500).json({ error: 'ALT_FB_TOKEN tidak dijumpai di server ENV.' });
    }

    // Verify last 5 characters (Robust check: trim token and compare case-insensitive)
    const cleanToken = ALT_FB_TOKEN.trim();
    const last5 = cleanToken.slice(-5).toLowerCase();
    const inputCode = code.trim().toLowerCase();

    if (inputCode !== last5) {
        console.error(`Alt Login Fail: Input[${inputCode}] vs Expected[${last5}]`);
        return res.status(401).json({ error: 'Kod salah. Sila semak semula.' });
    }

    try {
        // 1. Fetch User Info
        const userRes = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${ALT_FB_TOKEN}&fields=id,name,picture.type(large)`);
        const userData = await userRes.json();

        if (userData.error) {
            return res.status(400).json({ error: 'Token tidak sah atau sudah tamat tempoh.', details: userData.error });
        }

        // 2. Fetch Ad Accounts
        const accountsRes = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?access_token=${ALT_FB_TOKEN}&fields=id,name,account_id,currency`);
        const accountsData = await accountsRes.json();

        if (accountsData.error) {
            return res.status(400).json({ error: 'Gagal mendapatkan senarai akaun iklan.', details: accountsData.error });
        }

        return res.status(200).json({
            success: true,
            accessToken: ALT_FB_TOKEN,
            userData: {
                id: userData.id,
                name: userData.name,
                picture: userData.picture?.data?.url || ''
            },
            adAccounts: accountsData.data || []
        });

    } catch (error: any) {
        console.error('Alt Login Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
