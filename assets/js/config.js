// Supabase client configuration
// This script must be loaded AFTER the Supabase CDN script:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

// Supabase credentials
const supabaseUrl = 'https://cmfohldnmytmwjynqfpz.supabase.co';
const supabaseKey = 'sb_publishable_B1Akr8vzkzZvAZdTaxqgDA_BalvZXHi';

// Initialize Supabase client globally
// Make sure the Supabase CDN script is included before this file
window.supabase = supabase.createClient(supabaseUrl, supabaseKey);