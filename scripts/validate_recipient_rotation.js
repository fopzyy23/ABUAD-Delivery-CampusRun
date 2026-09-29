const fs = require('fs');
const p = 'supabase/migrations/20261224_recipient_rotation.sql';
const s = fs.readFileSync(p, 'utf8');
for (const x of ['is_active', 'account_fingerprint', 'uq_active_transfer_recipient_owner', 'p_account_fingerprint', "recipient_status='verified'", 'recipient_code']) if (!s.includes(x)) throw new Error(`recipient rotation missing ${x}`);
if (/DROP INDEX IF EXISTS uq_transfer_recipient_vendor/.test(s) === false) throw new Error('historical vendor uniqueness not removed');
console.log('recipient rotation validator: PASS');
