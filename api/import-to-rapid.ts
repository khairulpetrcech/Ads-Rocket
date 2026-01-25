/**
 * Import Media to Rapid Campaign API
 * Downloads media from external URL and stores in Supabase with 7-day expiry
 */
import { createClient } from '@supabase/supabase-js';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb',
        },
    },
};

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ztpedgagubjoiluagqzd.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Check for required environment variable
    if (!SUPABASE_SERVICE_KEY) {
        console.error('[RapidImport] SUPABASE_SERVICE_KEY not configured');
        return res.status(500).json({
            error: 'SUPABASE_SERVICE_KEY not configured. Please add it to your Vercel environment variables.',
            setup_required: true
        });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // GET - Fetch all rapid creatives (not expired)
    if (req.method === 'GET') {
        try {
            const now = new Date().toISOString();

            const { data, error } = await supabase
                .from('rapid_creatives')
                .select('*')
                .gt('expires_at', now)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('[RapidImport] Fetch error:', error);
                return res.status(500).json({ error: error.message });
            }

            return res.status(200).json({ success: true, creatives: data || [] });
        } catch (error: any) {
            console.error('[RapidImport] Server Error:', error);
            return res.status(500).json({ error: error.message });
        }
    }

    // DELETE - Remove a creative
    if (req.method === 'DELETE') {
        try {
            const { id } = req.query;

            if (!id) {
                return res.status(400).json({ error: 'Creative ID is required' });
            }

            // Get the creative to find the file path
            const { data: creative, error: fetchError } = await supabase
                .from('rapid_creatives')
                .select('file_path')
                .eq('id', id)
                .single();

            if (fetchError) {
                console.error('[RapidImport] Fetch for delete error:', fetchError);
            }

            // Delete from storage if file path exists
            if (creative?.file_path) {
                const { error: storageError } = await supabase.storage
                    .from('rapid-creatives')
                    .remove([creative.file_path]);

                if (storageError) {
                    console.error('[RapidImport] Storage delete error:', storageError);
                }
            }

            // Delete from database
            const { error: deleteError } = await supabase
                .from('rapid_creatives')
                .delete()
                .eq('id', id);

            if (deleteError) {
                console.error('[RapidImport] Delete error:', deleteError);
                return res.status(500).json({ error: deleteError.message });
            }

            return res.status(200).json({ success: true, message: 'Creative deleted' });
        } catch (error: any) {
            console.error('[RapidImport] Server Error:', error);
            return res.status(500).json({ error: error.message });
        }
    }

    // POST - Import new media
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { mediaUrl, mediaType, name, sourceUuid } = req.body;

        if (!mediaUrl) {
            return res.status(400).json({ error: 'Media URL is required' });
        }

        console.log(`[RapidImport] Downloading media: ${mediaUrl.substring(0, 80)}...`);

        // Download the media from external URL
        const mediaResponse = await fetch(mediaUrl);
        if (!mediaResponse.ok) {
            throw new Error(`Failed to download media: ${mediaResponse.status}`);
        }

        const contentType = mediaResponse.headers.get('content-type') ||
            (mediaType === 'video' ? 'video/mp4' : 'image/png');
        const extension = mediaType === 'video' ? 'mp4' :
            (contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png');

        const buffer = await mediaResponse.arrayBuffer();
        const uint8Array = new Uint8Array(buffer);

        // Generate unique filename
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        const fileName = `${timestamp}-${randomId}.${extension}`;
        const filePath = `imports/${fileName}`;

        console.log(`[RapidImport] Uploading to Supabase storage: ${filePath}`);

        // Upload to Supabase storage
        const { error: uploadError } = await supabase.storage
            .from('rapid-creatives')
            .upload(filePath, uint8Array, {
                contentType,
                upsert: false
            });

        if (uploadError) {
            console.error('[RapidImport] Upload error:', uploadError);
            return res.status(500).json({ error: 'Failed to upload to storage: ' + uploadError.message });
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('rapid-creatives')
            .getPublicUrl(filePath);

        const publicUrl = urlData?.publicUrl;

        // Calculate expiry (7 days from now)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        // Insert record into database
        const { data: insertData, error: insertError } = await supabase
            .from('rapid_creatives')
            .insert({
                file_url: publicUrl,
                file_path: filePath,
                media_type: mediaType || 'image',
                original_url: mediaUrl,
                name: name || `Imported ${mediaType}`,
                source_uuid: sourceUuid,
                created_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString()
            })
            .select()
            .single();

        if (insertError) {
            console.error('[RapidImport] Insert error:', insertError);
            // Cleanup uploaded file on insert failure
            await supabase.storage.from('rapid-creatives').remove([filePath]);
            return res.status(500).json({ error: 'Failed to save record: ' + insertError.message });
        }

        console.log(`[RapidImport] Success! ID: ${insertData.id}`);

        return res.status(200).json({
            success: true,
            creative: insertData,
            message: 'Media imported successfully'
        });

    } catch (error: any) {
        console.error('[RapidImport] Server Error:', error);
        return res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
}
