// ACTION 12 — Live verification of the secure-order-pricing migration.
// Uses ONLY the public publishable (anon) key from assets/js/config.js.
// No service-role key is used or referenced.
// Read-only probes, plus two deliberately-blocked write probes that verify
// the server rejects forged orders (they must fail with 4xx).
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

async function rest(method, pathAndQuery, extra) {
  const res = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
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
  // 1. Existing workflows intact: orders still reachable.
  const orders = await rest('GET', 'orders?select=id&limit=1');
  check('orders table still reachable', orders.status === 200 || orders.status === 401, `HTTP ${orders.status}`);

  const products = await rest('GET', 'products?select=id,price,vendor_id,active&limit=1');
  check('products table still reachable (pricing source)', products.status === 200 || products.status === 401, `HTTP ${products.status}`);

  // 2. place_order RPC visibility. An anon call must NOT succeed.
  //    Expected: 404 (migration not applied yet) OR 404/42501-style
  //    "permission denied for function place_order" / "authentication
  //    required" once applied — any 4xx is fine, 2xx would be a bug.
  const rpc = await rest('POST', 'rpc/place_order', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_items: [], p_spot: '' })
  });
  check('anon cannot execute place_order (2xx would be a bug)', rpc.status >= 400 && rpc.status < 500,
    `HTTP ${rpc.status} ${rpc.json && (rpc.json.code || rpc.json.message) ? (rpc.json.code || '') + ' ' + String(rpc.json.message).slice(0, 80) : ''}`);

  // 3. Direct anon INSERT into orders must be rejected (RLS: no anon
  //    insert policy; post-migration also INSERT-revoked).
  const insOrder = await rest('POST', 'orders', {
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ total: 1, fee: 1, subtotal: 0, status: 'Delivered', spot: 'x' })
  });
  check('anon INSERT into orders blocked (forged totals rejected)', insOrder.status === 400 || insOrder.status === 401 || insOrder.status === 403 || insOrder.status === 404,
    `HTTP ${insOrder.status} ${insOrder.json && insOrder.json.message ? String(insOrder.json.message).slice(0, 80) : ''}`);

  // 4. Direct anon INSERT into order_items must be rejected as well.
  const insItem = await rest('POST', 'order_items', {
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ order_id: '00000000-0000-0000-0000-000000000000', product_id: 1, qty: 1, price: 1 })
  });
  check('anon INSERT into order_items blocked (forged prices rejected)', insItem.status === 400 || insItem.status === 401 || insItem.status === 403 || insItem.status === 404,
    `HTTP ${insItem.status} ${insItem.json && insItem.json.message ? String(insItem.json.message).slice(0, 80) : ''}`);

  // 5. Migration-applied hint: place_order 404 with code PGRST202 means the
  //    RPC is missing from the live project.
  const applied = !(rpc.json && rpc.json.code === 'PGRST202');
  check('place_order RPC present on live project (20260906 applied)',
    applied, applied ? '' : 'PGRST202 — MIGRATION 20260906 NOT APPLIED YET');

  console.log('');
  if (failures === 0) console.log('ALL LIVE CHECKS PASSED');
  else { console.log(`${failures} CHECK(S) FAILED`); process.exitCode = 1; }
})().catch(err => { console.error('Live check error:', err.message); process.exit(1); });