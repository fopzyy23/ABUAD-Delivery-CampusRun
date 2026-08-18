// Read-only RLS verification — uses ONLY the publishable key.
// Does NOT modify anything. Tries to confirm:
//   1. Public catalog tables (vendors/products) are reachable
//   2. Whether pg_policies / RLS metadata is exposed via PostgREST
//   3. Reports what can and cannot be verified from this environment
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cmfohldnmytmwjynqfpz.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_B1Akr8vzkzZvAZdTaxqgDA_BalvZXHi';

const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY);

async function run() {
  console.log('=== READ-ONLY RLS VERIFICATION (publishable key only) ===\n');

  // 1. Public catalog reachability (should succeed if public-read policies active)
  const v = await supabase.from('vendors').select('id').limit(1);
  console.log('[vendors] select:',
    v.error ? `ERROR ${v.error.code}: ${v.error.message}` : `OK (${(v.data || []).length} row)`);

  const p = await supabase.from('products').select('id').limit(1);
  console.log('[products] select:',
    p.error ? `ERROR ${p.error.code}: ${p.error.message}` : `OK (${(p.data || []).length} row)`);

  // 2. Attempt to reach pg_policies / RLS metadata via PostgREST
  //    (expected to fail — system catalogs are not exposed through PostgREST)
  const pp = await supabase.from('pg_policies').select('*').limit(1);
  console.log('[pg_policies] select:',
    pp.error ? `NOT EXPOSED (${pp.error.code}: ${pp.error.message})` : 'UNEXPECTED SUCCESS');

  // 3. Attempt to reach pg_catalog.pg_policies similarly
  const pc = await supabase.from('pg_catalog.pg_policies').select('*').limit(1);
  console.log('[pg_catalog.pg_policies] select:',
    pc.error ? `NOT EXPOSED (${pc.error.code}: ${pc.error.message})` : 'UNEXPECTED SUCCESS');

  // 4. Attempt RLS-enabled status via information_schema (also system catalog)
  const rt = await supabase.from('information_schema.tables').select('table_name').limit(1);
  console.log('[information_schema.tables] select:',
    rt.error ? `NOT EXPOSED (${rt.error.code}: ${rt.error.message})` : 'OK - metadata schema exposed');

  console.log('\n=== VERIFICATION COMPLETE - READ-ONLY, NO MIGRATIONS EXECUTED ===');
}

run();