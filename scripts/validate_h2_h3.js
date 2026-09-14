const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261012_h2_h3_production_readiness.sql'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'assets/js/admin.js'), 'utf8');
const transfer = fs.readFileSync(path.join(root, 'supabase/functions/paystack-transfer/index.ts'), 'utf8');
let failed = false;
function check(label, ok) { console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}`); if (!ok) failed = true; }
check('server derives delivery capability', /bool_and\(COALESCE\(v\.delivery_method/.test(sql));
check('place_order has no delivery method argument', /place_order\(\s*p_items jsonb,\s*p_spot\s+text/s.test(sql) && !/place_order\([^)]*delivery_method/s.test(sql));
check('vendor_self has zero delivery shares', /v_fee := 0; v_rider_share := 0; v_company_share := 0/.test(sql));
check('rider pool requires delivery_method rider', /delivery_method = 'rider'/.test(fs.readFileSync(path.join(root, 'supabase/migrations/20261010_vendor_delivery_payment.sql'), 'utf8')));
check('admin settlement wrapper is admin gated', /admin_generate_settlement[\s\S]*is_admin\(\)/.test(sql));
check('admin UI loads authoritative ledgers', /from\('vendor_settlements'\)[\s\S]*from\('delivery_settlements'\)[\s\S]*from\('transfers'\)/.test(admin));
check('browser executes by transfer id only', /body: JSON\.stringify\(\{ transfer_id:/.test(admin));
check('edge function rejects payout values', /forbidden = \["amount"/.test(transfer));
process.exit(failed ? 1 : 0);
