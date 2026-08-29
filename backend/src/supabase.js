import { createClient } from '@supabase/supabase-js';

import { config } from './config.js';

export const supabase = createClient(
    config.supabaseUrl,
    config.supabaseSecretKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

export const LISTING_IMAGES_BUCKET = 'listing-images';
