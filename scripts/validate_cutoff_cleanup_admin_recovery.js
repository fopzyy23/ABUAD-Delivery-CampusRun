const fs=require('fs');
const migration=fs.readFileSync('supabase/migrations/20261231_cutoff_recovery_reliability.sql','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
const admin=fs.readFileSync('assets/js/admin.js','utf8');
const edge=fs.readFileSync('supabase/functions/admin-financial-recovery/index.ts','utf8');
const cleanupA=fs.readFileSync('supabase/functions/cleanup-rate-limits/index.ts','utf8');
const cleanupB=fs.readFileSync('supabase/functions/cleanup-admissions/index.ts','utf8');
const tests=[
 ['admin cutoff state allowed',/admin_resolution_required/],
 ['bounded retry default is five',/COALESCE\(c\.max_retry_count,5\)/],
 ['failed/reversed reimbursement stages retry',/reimbursement_failed','reimbursement_reversed/],
 ['active transfers reused',/existing\.status IN \('pending','processing','success'\)/],
 ['reservation retained',/reserve_financial_resolution\(o\.id,'reimbursement'/],
 ['cleanup rate limits disables gateway JWT',/\[functions\.cleanup-rate-limits\][\s\S]*verify_jwt = false/],
 ['cleanup admissions disables gateway JWT',/\[functions\.cleanup-admissions\][\s\S]*verify_jwt = false/],
 ['cleanup handlers check dedicated secret',/CLEANUP_JOB_SECRET/],
 ['admin does not directly call service retry RPC',!/supabase\.rpc\('retry_automatic_8pm_cutoff_reimbursement'/.test(admin)],
 ['admin invokes recovery edge function',admin.includes("functions.invoke('admin-financial-recovery'")],
 ['recovery requires admin',/rpc\("is_admin"\)/],
 ['recovery requires AAL2',/require_admin_aal2/],
 ['recovery accepts narrow action only',/action !== "retry_cutoff_reimbursement"/],
];
let fail=0; for(const [n,x] of tests){const ok=typeof x==='boolean'?x:x.test(migration+config+edge+cleanupA+cleanupB); console.log(`${ok?'PASS':'FAIL'} — ${n}`); if(!ok)fail++;} if(fail)process.exit(1); console.log('CUTOFF/CLEANUP/ADMIN RECOVERY CHECKS PASSED');
