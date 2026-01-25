/**
 * Vercel Serverless Function to exchange short-lived FB token for long-lived token.
 * This keeps the App Secret secure on the server side.
 * 
 * Long-lived tokens are valid for ~60 days instead of ~1-2 hours.
 */

const FB_APP_ID = '861724536220118'; // Your public App ID
const FB_APP_SECRET = process.env.FB_APP_SECRET; // Set this in Vercel Environment Variables

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { shortLivedToken } = req.body;

    if (!shortLivedToken) {
        return res.status(400).json({ error: 'Missing shortLivedToken in request body' });
    }

    if (!FB_APP_SECRET) {
        console.error('FB_APP_SECRET environment variable is not set!');
        return res.status(500).json({ error: 'Server configuration error: App secret not configured' });
    }

    try {
        // Exchange short-lived token for long-lived token
        const exchangeUrl = `https://graph.facebook.com/v19.0/oauth/access_token?` +
            `grant_type=fb_exchange_token&` +
            `client_id=${FB_APP_ID}&` +
            `client_secret=${FB_APP_SECRET}&` +
            `fb_exchange_token=${shortLivedToken}`;

        const response = await fetch(exchangeUrl);
        const data = await response.json();

        if (data.error) {
            console.error('FB Token Exchange Error:', data.error);
            return res.status(400).json({
                error: data.error.message || 'Failed to exchange token',
                code: data.error.code
            });
        }

        if (!data.access_token) {
            return res.status(400).json({ error: 'No access token in response' });
        }

        // Calculate expiry date (typically ~60 days)
        const expiresIn = data.expires_in || 5184000; // Default to 60 days in seconds
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        console.log(`Token exchanged successfully. Expires in ${Math.round(expiresIn / 86400)} days`);

        return res.status(200).json({
            access_token: data.access_token,
            token_type: data.token_type || 'bearer',
            expires_in: expiresIn,
            expires_at: expiresAt
        });

    } catch (error: any) {
        console.error('Token Exchange Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
