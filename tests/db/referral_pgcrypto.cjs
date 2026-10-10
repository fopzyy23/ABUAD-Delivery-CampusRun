const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { database, asUser, root } = require('./database.cjs');

async function main() {
  const db = await database('20270125');
  try {
    const q = (sql, params = []) => db.query(sql, params);
    await q("INSERT INTO vault.decrypted_secrets VALUES ('dropzyy_scheduler_base_url','https://test.invalid'),('push_dispatcher_secret','test-secret')");
    // The PGlite fixture installs pgcrypto in public; mirror staging's
    // extensions schema so this test exercises the qualified production call.
    await db.exec(`CREATE OR REPLACE FUNCTION extensions.gen_random_bytes(integer)
      RETURNS bytea LANGUAGE sql IMMUTABLE AS $$ SELECT public.gen_random_bytes($1) $$`);
    for (const name of fs.readdirSync(path.join(root, 'supabase/migrations'))
      .filter(name => name.endsWith('.sql') && name.split('_')[0] > '20270125' && name.split('_')[0] <= '20270215')
      .sort()) {
      const sql = fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8')
        .replace(/^CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net);\s*$/gmi, '');
      await db.exec(sql);
    }

    const userId = randomUUID();
    await q('INSERT INTO auth.users(id,email) VALUES($1,$2)', [userId, `${userId}@test.invalid`]);
    await q("INSERT INTO public.profiles(id,role,full_name) VALUES($1,'user','Referral Test')", [userId]);
    const call = (sql, params = []) => asUser(db, userId, 'aal1', tx => tx.query(sql, params));

    const code = (await call('SELECT public.ensure_referral_code() AS code')).rows[0].code;
    assert.match(code, /^[0-9A-F]{8}$/);
    const reward = (await call('SELECT public.issue_customer_signup_reward($1) AS result', [null])).rows[0].result;
    assert.equal(reward.issued, true);
    assert.equal(Number((await q("SELECT count(*) AS n FROM public.customer_credit_ledger WHERE user_id=$1 AND source_type='signup_reward'", [userId])).rows[0].n), 1);
    assert.equal(Number((await q('SELECT count(*) AS n FROM public.referral_codes WHERE user_id=$1', [userId])).rows[0].n), 1);
    console.log('PASS authenticated referral functions execute with extensions.gen_random_bytes and remain idempotent');
  } finally {
    await db.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
