// Structural validator — Notifications improvements (per-item mark-read + rider
// pool notification). Static and deterministic; no network, no Supabase, no writes.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let fails = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!cond) fails++;
}

const app = fs.readFileSync(path.join(root, 'assets', 'js', 'app.js'), 'utf8');
const mig = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260917_notify_riders_new_pool_order.sql'), 'utf8');
const base = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260903_create_notifications.sql'), 'utf8');

// ---- Fix 1: per-item mark-as-read ----
const hIdx = app.indexOf('async function markNotificationRead(');
check('app.js: markNotificationRead helper exists', hIdx >= 0);
let hBody = '';
if (hIdx >= 0) {
  const nextFn = app.slice(hIdx + 10).search(/\n(async )?function |\nconst \w+ = /);
  hBody = nextFn >= 0 ? app.slice(hIdx, hIdx + 10 + nextFn) : app.slice(hIdx, hIdx + 2500);
}
check('helper: scoped update uses .eq(\'id\', id)', hBody.includes(".eq('id', id)"));
check('helper: scoped update uses .eq(\'user_id\', session.user.id)', hBody.includes(".eq('user_id', session.user.id)"));
check('helper: never trusts a recipient id from the DOM', !/dataset\.user|data-user-id|\.userId\b/.test(hBody));
check('helper: requires an authenticated session', hBody.includes('supabase.auth.getSession()'));
check('render: each notification tagged data-notif-id="${esc(n.id)}"', app.includes('data-notif-id="${esc(n.id)}"'));
check('render: unread items expose data-notif-read="${esc(n.id)}"', app.includes('data-notif-read="${esc(n.id)}"'));
check('render: stays escaped (esc(n.title) present)', app.includes('esc(n.title)'));
check('handler: delegated click branch wired to markNotificationRead', app.includes("e.target.closest('[data-notif-read]')") && app.includes('markNotificationRead(e.target.closest'));
check('app.js: no client-side "New order available" creation (server-side only)', !app.includes('New order available'));

// ---- Fix 2: rider pool notification trigger migration ----
check('migration: fires only on pool ENTRY (OLD.status IS DISTINCT FROM)', mig.includes("OLD.status IS DISTINCT FROM 'Ready for pickup'"));
check('migration: requires NEW.status = Ready for pickup', mig.includes("NEW.status = 'Ready for pickup'"));
check('migration: requires delivery_method = rider', mig.includes("NEW.delivery_method = 'rider'"));
check('migration: requires payment_status = success (unpaid never notified)', mig.includes("NEW.payment_status = 'success'"));
check('migration: requires rider_id IS NULL (unclaimed only)', mig.includes('NEW.rider_id IS NULL'));
check('migration: recipients limited to approved riders', mig.includes("r.status = 'approved'"));
check('migration: recipients limited to available riders (is_available_rider semantics)', mig.includes('r.available = true'));
check('migration: recipient is riders.user_id (RLS-covered profile id)', /SELECT\s+r\.user_id/i.test(mig));
check('migration: uses type rider', mig.includes("'rider',"));
check('migration: sets related_order_id = NEW.id', mig.includes('NEW.id'));
check('migration: trigger creation is idempotent (DROP TRIGGER IF EXISTS)', mig.includes('DROP TRIGGER IF EXISTS trg_notify_riders_new_pool_order'));

// ---- existing system untouched ----
check('base migration: handle_order_notifications function still defined', base.includes('handle_order_notifications'));
check('base migration: existing customer/vendor branches intact (Delivered branch)', base.includes("'Delivered'"));

console.log('');
if (fails) { console.log('NOTIFICATION VALIDATION FAILED: ' + fails + ' check(s)'); process.exit(1); }
console.log('ALL NOTIFICATION CHECKS PASSED');
