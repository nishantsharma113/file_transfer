import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

// Get the current domain
const getCurrentDomain = () => {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }
  return 'https://nishantsharma113.github.io/file_transfer';
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    // Configure site URL in Supabase Dashboard: Settings -> Auth -> Site URL
    // Add GitHub Pages URL to Additional Redirect URLs
  }
});

export const STORAGE_BUCKET = 'files'; 