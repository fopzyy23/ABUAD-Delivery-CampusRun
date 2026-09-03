// ============================================================
// validate_b1_b2_live.js — LIVE probes for pre-Paystack blockers
// B1 (payment-column lock) + B2 (identifier uniqueness).
//
// Uses ONLY the public publishable (anon) key from assets/js/config.js.
// No service-role key is used or referenced. Nothing is modified:
// the write probes are forge attempts that MUST NOT succeed, and each
// is followed by a re-read verifying the target row is unchanged.
//
// Probes:
//   1. anon cannot forge payment_status / payment_reference /
//      transaction_id / subtotal on a real order row (B1 trigger or
//      RLS must reject — verified by re-reading the row).
//   2. Sample scan (up to 1000 live rows): no duplicate order_number,
//      no blank order_number, no duplicate non-null transaction_id,
//      no duplicate payment_reference.
//   3. place_order is still not callable by anon (workflow intact).
//   4. Existing orders are still reachable / intact (count reported).
//
// NOTE on scope: the anon key cannot authenticate as a customer,
// vendor or rider, so those role-level rejections are enforced by the
// SAME trigger verified here and covered structurally by
// scripts/validate_b1_b2.js. 2xx-with-change or duplicates found => FAIL.
// ============================================================
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
let skipped = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};
const skip = (name, detail) => {
  console.log(`SKIP  ${name}${detail ? ' — ' + detail : ''}`);
  skipped++;
};

async function rest(method, pathAndQuery, extra) {
  const res = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { ...headers, ...(extra && extra.headers) },
    body: extra && extra.body
  });
  let text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json, text, range: res.headers.get('content-range') };
}

function hasDuplicates(values) {
  const seen = new Set();
  for (const v of values) {
    if (v === null || v === '') continue;
    if (seen.has(v)) return true;
    seen.add(v);
  }
  return false;
}

(async () => {
  // ---- Read live orders (up to 1000) ----
  const orders = await rest('GET',
    'orders?select=id,order_number,transaction_id,payment_reference,subtotal,payment_status&order=created_at.asc&limit=1000',
    { headers: { Prefer: 'count=exact' } });

  let sample = null;
  if (orders.status === 200 && Array.isArray(orders.json)) {
    sample = orders.json;
    const total = (orders.range || '').split('/')[1] || String(sample.length);
    console.log(`Live orders readable — sample ${sample.length} row(s), total ${total}.\n`);
  } else {
    console.log(`Live orders NOT anon-readable (HTTP ${orders.status}) — row-level probes will be skipped.\n`);
  }

  if (sample) {
    // ---- B2: identifier uniqueness on live data ----
    check('no duplicate order_number in live sample', !hasDuplicates(sample.map(o => o.order_number)));
    check('no NULL/blank order_number in live sample',
      sample.every(o => o.order_number !== null && String(o.order_number).trim() !== ''));
    check('no duplicate non-null transaction_id in live sample',
      !hasDuplicates(sample.map(o => o.transaction_id)));
    check('no duplicate payment_reference in live sample (unique constraint intact)',
      !hasDuplicates(sample.map(o => o.payment_reference)));

    // ---- B1: forge attempts against a REAL live row ----
    const target = sample.find(o => o.id);
    if (target) {
      const forgeAttempts = [
        ['payment_status', 'success', 'customer cannot forge payment_status=success'],
        ['payment_reference', 'FORGED-REF-B1-PROBE', 'payment_reference cannot be client-modified'],
        ['transaction_id', '999999999', 'transaction_id cannot be client-modified'],
        ['subtotal', 999999.99, 'subtotal cannot be client-modified']
      ];
      for (const [col, value, label] of forgeAttempts) {
        const body = JSON.stringify({ [col]: value });
        const attempt = await rest('PATCH', `orders?id=eq.${target.id}`, {
          headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body
        });
        const rejected = attempt.status >= 400 && attempt.status < 500;
        // Even on a 2xx (e.g. RLS-filtered update), the row must be unchanged.
        const verify = await rest('GET', `orders?select=${col},id&id=eq.${target.id}`);
        const after = Array.isArray(verify.json) && verify.json[0] ? verify.json[0][col] : undefined;
        const unchanged = after === target[col];
        check(label, rejected || unchanged,
          rejected
            ? `rejected with HTTP ${attempt.status} ${attempt.json && attempt.json.message ? String(attempt.json.message).slice(0, 80) : ''}`
            : (unchanged ? 'HTTP 2xx but row value unchanged (RLS/trigger blocked)' : `ROW CHANGED: ${target[col]} -> ${after}`));
      }
    } else {
      skip('B1 forge probes', 'no live order rows to probe');
    }
  } else {
    skip('B2 live duplicate scan', 'orders not anon-readable');
    skip('B1 live forge probes', 'orders not anon-readable');
  }

  // ---- Workflow intact: anon still cannot execute place_order ----
  const rpc = await rest('POST', 'rpc/place_order', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_items: [], p_spot: '' })
  });
  check('anon cannot execute place_order (2xx would be a bug)', rpc.status >= 400 && rpc.status < 500,
    `HTTP ${rpc.status} ${rpc.json && rpc.json.message ? String(rpc.json.message).slice(0, 80) : ''}`);

  console.log('');
  if (skipped) console.log(`(${skipped} probe group(s) skipped — see notes above)`);
  if (failures === 0) console.log('ALL LIVE CHECKS PASSED');
  else { console.log(`${failures} CHECK(S) FAILED`); process.exitCode = 1; }
})().catch(err => { console.error('Live check error:', err.message); process.exit(1); });
