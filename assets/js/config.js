// ============================================================
// Supabase client configuration — Dropzyy
// ============================================================
// SECURITY MODEL (ACTION 13):
//   * This file contains the project URL + the PUBLIC PUBLISHABLE (anon)
//     key ONLY. Publishable keys are designed to be exposed in browsers —
//     all data access is protected by Row Level Security on the server.
//   * NEVER put a service-role key, secret key or any other credential in
//     this file (or any frontend file). Service keys live ONLY in
//     environment variables for trusted server-side scripts (e.g.
//     SUPABASE_SERVICE_ROLE_KEY for scripts/seed_catalog.js).
//   * To point the app at a different Supabase project, replace the two
//     constants below with that project's URL + publishable/anon key
//     (Dashboard → Project Settings → API). This is a static Netlify site:
//     these values are copied unchanged by the static publish build.
//
// This script must be loaded AFTER the Supabase CDN script:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

// Supabase credentials
const supabaseUrl = 'https://cmfohldnmytmwjynqfpz.supabase.co';
const supabaseKey = 'sb_publishable_B1Akr8vzkzZvAZdTaxqgDA_BalvZXHi';
// Change ALL four settings for a staging/development artifact, and align CSP.
// Unknown origins (including deploy previews/local development) fail closed.
const browserEnvironment = 'production';
const frontendOrigins = ['https://dropzyy.com', 'https://www.dropzyy.com'];
const productionProjectUrl = 'https://cmfohldnmytmwjynqfpz.supabase.co';
if (!frontendOrigins.includes(window.location.origin) ||
    !['production', 'staging', 'development'].includes(browserEnvironment) ||
    (browserEnvironment !== 'production' && supabaseUrl === productionProjectUrl)) {
  window.supabase = null;
  document.addEventListener('DOMContentLoaded', () => {
    const target = document.getElementById('app');
    if (target) target.textContent = 'This deployment needs explicit environment configuration. Contact the site operator.';
  });
  throw new Error('Dropzyy browser environment is not configured for this origin.');
}

// Initialize Supabase client globally
// Make sure the Supabase CDN script is included before this file
window.supabase = supabase.createClient(supabaseUrl, supabaseKey);

// Edge Function base URL (same project, no secrets needed).
// Read-only: Edge Function env vars (PAYSTACK_SECRET_KEY etc.) are set
// server-side via `supabase functions deploy` — never in frontend code.
window.SUPABASE_EDGE_URL = supabaseUrl;
// Public VAPID key only. The private key must remain server-side.
window.DROPZYY_VAPID_PUBLIC_KEY = window.DROPZYY_VAPID_PUBLIC_KEY || '';
