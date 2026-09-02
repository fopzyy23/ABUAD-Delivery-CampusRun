const fs = require('fs');
const s = fs.readFileSync('supabase/migrations/20260906_secure_order_pricing.sql', 'utf8');
const nc = s.replace(/--[^\n]*/g, '');
// Encoding integrity (PowerShell Set-Content round-trip check)
console.log('has naira:', s.includes('\u20A6'));
console.log('has arrow:', s.includes('\u2192'));
console.log('has replacement char (corruption):', s.includes('\uFFFD'));
console.log('markers left:', /continued below/.test(s));
const a = fs.readFileSync('assets/js/app.js', 'utf8');
console.log('app.js replacement chars (corruption):', a.includes('\uFFFD'));
// Structural checks
console.log('dollar-quote pairs ($$ count, must be even):', (nc.match(/\$\$/g) || []).length);
let bal = 0;
for (const ch of nc) { if (ch === '(') bal++; if (ch === ')') bal--; }
console.log('paren balance (must be 0):', bal);
const fns = [...nc.matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)/g)].map(m => m[1]);
console.log('functions:', fns.join(', '));
const pols = [...nc.matchAll(/CREATE POLICY "([^"]+)"/g)].map(m => m[1]);
console.log('policies recreated:', pols.join(', '));
const trigs = [...nc.matchAll(/CREATE TRIGGER (\w+)/g)].map(m => m[1]);
console.log('triggers created:', trigs.join(', '));
const assert = require('assert');
assert.strictEqual((nc.match(/\$\$/g) || []).length % 2, 0, 'unbalanced $$');
assert.strictEqual(bal, 0, 'unbalanced parens');
assert.ok(!s.includes('\uFFFD'), 'SQL file encoding corrupted');
assert.ok(!a.includes('\uFFFD'), 'app.js encoding corrupted');
assert.ok(fns.includes('public.place_order'), 'place_order missing');
assert.ok(fns.includes('public.enforce_order_item_pricing'), 'pricing trigger fn missing');
assert.ok(fns.includes('public.enforce_order_status_transitions'), 'transition fn missing');
assert.deepStrictEqual(pols, ['orders_update_vendor', 'orders_update_assigned']);
assert.ok(trigs.includes('trg_enforce_order_item_pricing'), 'pricing trigger missing');
console.log('SMOKE TEST: OK');