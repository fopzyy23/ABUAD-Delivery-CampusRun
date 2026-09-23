const fs = require('fs');
const strip = s => s.replace(/--[^\n]*/g, '');
const norm = s => s.replace(/\s+/g, ' ').trim();

function grabBody(t, fn) {
  const i = t.indexOf('FUNCTION public.' + fn);
  if (i < 0) return null;
  const declare = t.indexOf('DECLARE', i);
  const begin = t.indexOf('BEGIN', i);
  const start = declare >= 0 && declare < begin ? declare : begin;
  const a1 = t.indexOf('$$;', i), a2 = t.indexOf('$func$;', i);
  const end = (a2 >= 0 && (a1 < 0 || a2 < a1)) ? a2 : a1;
  return strip(t.slice(start, end));
}

// ---- 1. Trigger body vs canonical 20261007 ----
const cur = fs.readFileSync('supabase/migrations/20261022_rider_earnings_foundation.sql', 'utf8');
const base = fs.readFileSync('supabase/migrations/20261007_vendor_followup.sql', 'utf8');
const c = norm(grabBody(cur, 'enforce_order_status_transitions'));
const b = norm(grabBody(base, 'enforce_order_status_transitions'))
  .replace('BEGIN', 'DECLARE v_active_count integer; BEGIN');
const noCap = c
  .replace(/PERFORM 1 FROM public\.riders WHERE id = NEW\.rider_id FOR UPDATE;/, '')
  .replace(/SELECT count\(\*\) INTO v_active_count\s*FROM public\.orders\s*WHERE rider_id = NEW\.rider_id\s*AND status IN \('Rider assigned', 'Picked up', 'On the Way'\);/, '')
  .replace(/IF v_active_count >= 2 THEN\s*RAISE EXCEPTION 'Rider already has % active deliveries \(maximum 2\)', v_active_count;\s*END IF;/, '');
console.log('TRIGGER: cap check present:', c.includes('v_active_count >= 2'), '| rider lock present:', c.includes('FOR UPDATE'));
console.log('TRIGGER: body-minus-cap identical to canonical 20261007:', norm(noCap) === b);
if (norm(noCap) !== b) {
  const a = norm(noCap), d = b;
  for (let i = 0; i < Math.max(a.length, d.length); i++) {
    if (a[i] !== d[i]) {
      console.log('first diff at', i);
      console.log('CUR :', a.slice(Math.max(0, i - 70), i + 90));
      console.log('BASE:', d.slice(Math.max(0, i - 70), i + 90));
      break;
    }
  }
}

// ---- 2. request_withdrawal vs canonical 20261005 (earnings subquery only) ----
const wBase = fs.readFileSync('supabase/migrations/20261005_secure_withdrawal_rpc.sql', 'utf8');
const cw = grabBody(cur, 'request_withdrawal');
const bw = grabBody(wBase, 'request_withdrawal');
const cwN = norm(cw)
  .replace(/LIFETIME \(20261022\)[^;]*;/, '')
  .replace(/SELECT COALESCE\(SUM\(ds\.rider_amount\), 0\) INTO v_earned[\s\S]*?AND ds\.status <> 'reversed';/, 'EARNQ');
const bwN = norm(bw).replace(/v_pending_earnings/g, 'v_earned')
  .replace(/SELECT COALESCE\(SUM\(ds\.rider_amount\), 0\)[\s\S]*?AND ds\.status = 'pending';/, 'EARNQ');
console.log('WITHDRAWAL: lifetime boundary present:', cw.includes("ds.status <> 'reversed'"));
console.log('WITHDRAWAL: body-minus-earnings identical to 20261005:', cwN === bwN);
if (cwN !== bwN) {
  for (let i = 0; i < Math.max(cwN.length, bwN.length); i++) {
    if (cwN[i] !== bwN[i]) {
      console.log('first diff at', i);
      console.log('CUR :', cwN.slice(Math.max(0, i - 70), i + 90));
      console.log('BASE:', bwN.slice(Math.max(0, i - 70), i + 90));
      break;
    }
  }
}

// ---- 3. get_rider_earnings sanity ----
console.log('EARNINGS RPC: ownership gate:', /r\.id = p_rider_id AND r\.user_id = auth\.uid\(\)/.test(cur));
console.log('EARNINGS RPC: lifetime key:', cur.includes("'lifetime_earnings'"), '| lifetime_available key:', cur.includes("'lifetime_available_balance'"));
console.log('EARNINGS RPC: legacy keys kept:', cur.includes("'pending_earnings'") && cur.includes("'available_balance'"));
