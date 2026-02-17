import { createClient } from '@supabase/supabase-js';

// Vercel config: max 60 seconds for campaign creation and video processing
export const config = {
    maxDuration: 60
};

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { jobId } = req.body;

    if (!jobId) {
        return res.status(400).json({ error: 'Missing jobId' });
    }

    let jobData: any = null;
    try {
        console.log(`[Telegram Launch] Processing job: ${jobId}`);

        // 1. Fetch Job Data from Supabase
        const { data: job, error: jobError } = await supabase
            .from('telegram_campaign_jobs')
            .select('*')
            .eq('id', jobId)
            .single();

        if (jobError || !job) {
            throw new Error(`Job not found: ${jobError?.message || 'Unknown error'}`);
        }
        jobData = job;

        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
            return res.status(200).json({ message: 'Job already processed', status: job.status });
        }

        // Update status to PROCESSING
        await supabase
            .from('telegram_campaign_jobs')
            .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
            .eq('id', jobId);

        // 2. Fetch User Tokens & Ad Account
        const { data: user, error: userError } = await supabase
            .from('telegram_users')
            .select('fb_access_token, telegram_bot_token')
            .eq('fb_id', job.fb_id)
            .single();

        if (userError || !user || !user.fb_access_token) {
            throw new Error('User credentials not found');
        }

        const accessToken = user.fb_access_token;
        const botToken = user.telegram_bot_token;
        const chatId = job.chat_id;

        // 3. Download Media from Telegram
        console.log(`[Telegram Launch] Downloading ${job.media_type} from Telegram...`);
        const mediaBuffer = await downloadTelegramFile(botToken, job.media_file_id);

        // 4. Upload Media to Meta
        let assetId: string;
        let thumbnailHash: string | undefined;

        if (job.media_type === 'video') {
            console.log(`[Telegram Launch] Uploading video to Meta...`);
            assetId = await uploadVideoToMeta(job.ad_account_id, mediaBuffer, accessToken);

            // Skip waiting for video to be ready - Meta will process it asynchronously
            // The ad will be queued and go live once the video is processed
            console.log(`[Telegram Launch] Video uploaded (${assetId}). Meta will process it asynchronously.`);

            // Try to get thumbnail, but don't fail if it's not ready yet
            try {
                thumbnailHash = await getAutoThumbnailHash(job.ad_account_id, assetId, accessToken);
            } catch (e) {
                console.warn('[Telegram Launch] Could not get thumbnail (video may still be processing):', e);
                thumbnailHash = undefined;
            }
        } else {
            console.log(`[Telegram Launch] Uploading image to Meta...`);
            assetId = await uploadImageToMeta(job.ad_account_id, mediaBuffer, accessToken);
        }

        // 5. Apply Template + Overrides
        const settings = job.parsed_settings;
        const template = job.template_data; // This should be pre-fetched by webhook

        // Merge logic
        const campaignName = settings.campaignName || template?.campaign?.name || `TG Campaign ${new Date().toLocaleDateString()}`;
        const objective = settings.objective || template?.campaign?.objective || 'OUTCOME_SALES';
        const dailyBudget = settings.dailyBudget || template?.campaign?.dailyBudget || 50;
        const adSetName = settings.adSetName || template?.adSet?.name || `TG AdSet ${objective}`;

        const adConfig = template?.ads?.[0] || {
            adName: 'TG Ad',
            primaryText: 'Checkout our latest offer!',
            headline: 'Special Promotion',
            description: '',
            cta: 'LEARN_MORE'
        };

        const pageId = settings.pageId || template?.config?.pageId;
        const pixelId = settings.pixelId || template?.config?.pixelId;
        const websiteUrl = settings.websiteUrl || template?.config?.url;

        if (!pageId) throw new Error('Missing Page ID. Please set a default Page in your Website Settings.');

        // 6. Execute Meta Creation Sequence
        console.log(`[Telegram Launch] Creating Campaign: ${campaignName}`);
        const campaign = await createMetaCampaign(job.ad_account_id, campaignName, objective, accessToken);

        console.log(`[Telegram Launch] Creating AdSet: ${adSetName}`);
        const adSet = await createMetaAdSet(
            job.ad_account_id,
            campaign.id,
            adSetName,
            dailyBudget,
            objective === 'OUTCOME_SALES' ? 'OFFSITE_CONVERSIONS' : 'POST_ENGAGEMENT',
            pixelId,
            accessToken,
            pageId
        );

        console.log(`[Telegram Launch] Creating Creative...`);
        const creativeId = await createMetaCreative(
            job.ad_account_id,
            adConfig.adName,
            pageId,
            assetId,
            adConfig.primaryText,
            adConfig.headline,
            websiteUrl || 'https://example.com',
            accessToken,
            job.media_type,
            adConfig.cta,
            adConfig.description,
            thumbnailHash
        );

        console.log(`[Telegram Launch] Creating Ad...`);
        const ad = await createMetaAd(job.ad_account_id, adSet.id, adConfig.adName, creativeId, accessToken);

        // 7. Success!
        const result = {
            campaignId: campaign.id,
            adSetId: adSet.id,
            adId: ad.id
        };

        await supabase
            .from('telegram_campaign_jobs')
            .update({
                status: 'COMPLETED',
                result,
                updated_at: new Date().toISOString()
            })
            .eq('id', jobId);

        await sendTelegramMessage(botToken, chatId, `✅ *Campaign Launched Successfully!*\n\n🚀 *${campaignName}*\n💰 Budget: RM${dailyBudget}\n🎯 Objective: ${objective}\n\nIklan anda kini sedang dalam review oleh Meta.`);

        return res.status(200).json({ success: true, result });

    } catch (error: any) {
        console.error('[Telegram Launch] Error:', error);

        await supabase
            .from('telegram_campaign_jobs')
            .update({
                status: 'FAILED',
                error_message: error.message,
                updated_at: new Date().toISOString()
            })
            .eq('id', jobId);

        // Notify user of failure
        const fbId = jobData?.fb_id;
        const botTokenData = fbId ? (await supabase.from('telegram_users').select('telegram_bot_token').eq('fb_id', fbId).single()).data : null;
        const botToken = botTokenData?.telegram_bot_token;
        if (botToken && jobData?.chat_id) {
            await sendTelegramMessage(botToken, jobData.chat_id, `❌ *Campaign Launch Failed*\n\nReason: ${error.message}`);
        }

        return res.status(500).json({ error: error.message });
    }
}

// --- HELPER FUNCTIONS (Node.js versions) ---

async function downloadTelegramFile(botToken: string, fileId: string): Promise<Buffer> {
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) throw new Error(`Telegram getFile failed: ${fileData.description}`);

    const filePath = fileData.result.file_path;
    const downloadRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    const arrayBuffer = await downloadRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function uploadImageToMeta(accountId: string, buffer: Buffer, accessToken: string): Promise<string> {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/adimages`;

    // Create form-data payload manually for Node compatibility with minimal dependencies
    const formData = new FormData();
    formData.append('access_token', accessToken);
    formData.append('filename', new Blob([buffer as any]), 'image.jpg');

    const res = await fetch(url, { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    const images = data.images || {};
    const firstKey = Object.keys(images)[0];
    if (firstKey && images[firstKey].hash) return images[firstKey].hash;
    throw new Error('Image upload failed: No hash returned');
}

async function uploadVideoToMeta(accountId: string, buffer: Buffer, accessToken: string): Promise<string> {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph-video.facebook.com/v19.0/${actId}/advideos`;

    // Step 1: Start
    const startForm = new FormData();
    startForm.append('access_token', accessToken);
    startForm.append('upload_phase', 'start');
    startForm.append('file_size', buffer.length.toString());

    const startRes = await fetch(url, { method: 'POST', body: startForm });
    const startData = await startRes.json();
    if (startData.error) throw new Error(startData.error.message);

    const sessionId = startData.upload_session_id;

    // Step 2: Transfer (single chunk if small enough, but let's do one transfer for simplicity assuming < 25MB)
    const transferForm = new FormData();
    transferForm.append('access_token', accessToken);
    transferForm.append('upload_phase', 'transfer');
    transferForm.append('upload_session_id', sessionId);
    transferForm.append('start_offset', '0');
    transferForm.append('video_file_chunk', new Blob([buffer as any]), 'video.mp4');

    const transferRes = await fetch(url, { method: 'POST', body: transferForm });
    const transferData = await transferRes.json();
    if (transferData.error) throw new Error(transferData.error.message);

    // Step 3: Finish
    const finishForm = new FormData();
    finishForm.append('access_token', accessToken);
    finishForm.append('upload_phase', 'finish');
    finishForm.append('upload_session_id', sessionId);

    const finishRes = await fetch(url, { method: 'POST', body: finishForm });
    const finishData = await finishRes.json();
    if (finishData.error) throw new Error(finishData.error.message);

    return finishData.id || startData.video_id;
}

async function waitForVideoReady(videoId: string, accessToken: string, retries = 20): Promise<boolean> {
    const url = `https://graph.facebook.com/v19.0/${videoId}?fields=status&access_token=${accessToken}`;
    for (let i = 0; i < retries; i++) {
        const res = await fetch(url);
        const data = await res.json();
        const status = data.status?.video_status;
        if (status === 'READY') return true;
        if (status === 'ERROR') throw new Error('Meta video processing failed');
        await new Promise(r => setTimeout(r, 3000));
    }
    return false;
}

async function getAutoThumbnailHash(accountId: string, videoId: string, accessToken: string): Promise<string | undefined> {
    try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${videoId}?fields=picture&access_token=${accessToken}`);
        const data = await res.json();
        if (data.picture) {
            const imgRes = await fetch(data.picture);
            const imgBuffer = await imgRes.arrayBuffer();
            return await uploadImageToMeta(accountId, Buffer.from(imgBuffer), accessToken);
        }
    } catch (e) {
        console.warn('Failed to auto-generate thumbnail hash:', e);
    }
    return undefined;
}

async function createMetaCampaign(accountId: string, name: string, objective: string, accessToken: string) {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/campaigns`;

    const body = {
        name,
        objective,
        status: 'ACTIVE',
        special_ad_categories: [],
        buying_type: 'AUCTION',
        access_token: accessToken
    };

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data;
}

async function createMetaAdSet(accountId: string, campaignId: string, name: string, budget: number, optimizationGoal: string, pixelId: string | null, accessToken: string, pageId: string) {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/adsets`;

    const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString().split('.')[0];
    const body: any = {
        name,
        campaign_id: campaignId,
        daily_budget: Math.floor(budget * 100),
        targeting: { geo_locations: { countries: ['MY'] }, age_min: 18 },
        status: 'ACTIVE',
        start_time: startTime,
        access_token: accessToken,
        optimization_goal: optimizationGoal,
        billing_event: 'IMPRESSIONS'
    };

    if (optimizationGoal === 'OFFSITE_CONVERSIONS' && pixelId) {
        body.promoted_object = { pixel_id: pixelId, custom_event_type: 'PURCHASE' };
    } else {
        body.promoted_object = { page_id: pageId };
    }

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data;
}

async function createMetaCreative(accountId: string, name: string, pageId: string, assetId: string, message: string, headline: string, link: string, accessToken: string, mediaType: string, cta: string, description: string, thumbnailHash?: string) {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/adcreatives`;

    const body: any = {
        name: `${name} Creative`,
        access_token: accessToken,
        published: false,
        object_story_spec: {
            page_id: pageId
        }
    };

    if (mediaType === 'image') {
        body.object_story_spec.link_data = {
            message,
            link,
            image_hash: assetId,
            name: headline,
            description,
            call_to_action: { type: cta }
        };
    } else {
        body.object_story_spec.video_data = {
            video_id: assetId,
            message,
            title: headline,
            link_description: description,
            call_to_action: { type: cta, value: { link } },
            image_hash: thumbnailHash
        };
    }

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.id;
}

async function createMetaAd(accountId: string, adSetId: string, name: string, creativeId: string, accessToken: string) {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `https://graph.facebook.com/v19.0/${actId}/ads`;

    const body = {
        name,
        adset_id: adSetId,
        creative: { creative_id: creativeId },
        status: 'ACTIVE',
        access_token: accessToken
    };

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data;
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown'
        })
    });
}
