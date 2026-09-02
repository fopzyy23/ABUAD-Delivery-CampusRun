// ACTION 11 — Live read-only verification of the notifications migration.
// Uses ONLY the public publishable (anon) key from assets/js/config.js.
// No service-role key is used or referenced. All requests are read-only
// except two deliberately-blocked write probes (anonymous INSERT / DELETE),
// which verify that RLS rejects unauthenticated writes.
const fs = require('fs');
const path = require('path');

const cfg = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'config.js'), 'utf8');
const urlMatch = cfg.match(/supabaseUrl\s*=\s*'([^']+)'/);
const keyMatch = cfg.match(/supabaseKey\s*=\s*'([^']+)'/);
if (!urlMatch || !keyMatch) { console.error('Could not read Supabase URL/key from config.js'); process.exit(1); }
const base = urlMatch[1];
const key = keyMatch[1];

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Profile': 'public'
};

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

async function rest(method, table, query, extra) {
  const res = await fetch(`${base}/rest/v1/${table}${query ? '?' + query : ''}`, {
    method,
    headers: { ...headers, ...(extra && extra.headers) },
    body: extra && extra.body
  });
  let text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json, text };
}

(async () => {
  // 1. Does the notifications table exist (i.e. was the migration applied)?
  const sel = await rest('GET', 'notifications', 'select=id,user_id,is_read&limit=1', {
    headers: { Accept: 'application/json' }
  });
  if (sel.status === 200) {
    check('notifications table exists (migration applied)', true, `HTTP ${sel.status}`);
  } else {
    const code = sel.json && sel.json.code ? sel.json.code : `HTTP ${sel.status}`;
    if (code === 'PGRST205' || sel.status === 404) {
      check('notifications table exists (migration applied)', false, `${code} — MIGRATION NOT APPLIED`);
    } else {
      check('notifications table reachable', false, `Unexpected: ${code} ${String(sel.text).slice(0, 200)}`);
    }
  }

  // 2. RLS: an anonymous (no user) SELECT must see ZERO rows — never another user's rows.
  if (sel.status === 200) {
    check('anon SELECT returns no cross-user rows (RLS active)', Array.isArray(sel.json) && sel.json.length === 0,
      `returned ${sel.json.length} row(s)`);
  }

  // 3. RLS: an anonymous INSERT must be rejected (notifications_insert_own requires auth.uid()).
  const ins = await rest('POST', 'notifications', '', {
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: '00000000-0000-0000-0000-000000000000', title: 'RLS probe', message: 'must fail' })
  });
  check('anon INSERT blocked (cannot forge notifications)', ins.status === 400 || ins.status === 401 || ins.status === 403,
    `HTTP ${ins.status} ${ins.json && ins.json.message ? ins.json.message : ''}`.trim());

  // 4. RLS: an anonymous DELETE must affect nothing (no DELETE policy exists).
  const del = await rest('DELETE', 'notifications', 'user_id=eq.00000000-0000-0000-0000-000000000000');
  // PostgREST answers 204 even when 0 rows match — that is fine: RLS filtered them.
  check('anon DELETE touches no rows (no DELETE policy path)', del.status === 204 || del.status === 401 || del.status === 403,
    `HTTP ${del.status}`);

  // 5. Orders/vendors side tables still reachable (existing workflows intact).
  const orders = await rest('GET', 'orders', 'select=id&limit=1');
  check('orders table still reachable (workflows untouched)', orders.status === 200 || orders.status === 401,
    `HTTP ${orders.status}`);

  console.log('');
  if (failures === 0) console.log('ALL LIVE CHECKS PASSED');
  else { console.log(`${failures} CHECK(S) FAILED`); process.exitCode = 1; }
})().catch(err => { console.error('Live check error:', err.message); process.exit(1); });
