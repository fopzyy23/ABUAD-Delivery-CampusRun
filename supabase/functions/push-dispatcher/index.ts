// Best-effort standards-based Web Push dispatcher.
// Required server secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
const subject = Deno.env.get("VAPID_SUBJECT");
const dispatcherSecret = Deno.env.get("PUSH_DISPATCHER_SECRET");

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function main(req: Request) {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!url || !serviceKey || !publicKey || !privateKey || !subject || !dispatcherSecret) return json({ error: "push dispatcher is not configured" }, 503);
  if (req.headers.get("x-dropzyy-push-secret") !== dispatcherSecret) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const notificationId = typeof body.notification_id === "string" ? body.notification_id : null;
  const db = createClient(url, serviceKey);
  let query = db.from("push_delivery_jobs").select("id,notification_id,subscription_id").in("status", ["pending", "retryable"]).lte("available_at", new Date().toISOString()).lt("attempts", 5).order("created_at").limit(50);
  if (notificationId) query = query.eq("notification_id", notificationId);
  const { data: jobs, error } = await query;
  if (error) return json({ error: error.message }, 500);
  const ids = [...new Set((jobs || []).map(j => j.notification_id))];
  const { data: notifications } = ids.length ? await db.from("notifications").select("id,user_id,title,message,type,related_order_id").in("id", ids) : { data: [] };
  const orderIds = [...new Set((notifications || []).map(n => n.related_order_id).filter(Boolean))];
  const { data: orderRows } = orderIds.length ? await db.from("orders").select("id,order_number").in("id", orderIds) : { data: [] };
  const orderMap = new Map((orderRows || []).map(o => [o.id, o.order_number]));
  const { data: subscriptions } = jobs?.length ? await db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth,active").in("id", jobs.map(j => j.subscription_id)) : { data: [] };
  const nmap = new Map((notifications || []).map(n => [n.id, n]));
  const smap = new Map((subscriptions || []).map(s => [s.id, s]));
  webpush.setVapidDetails(subject, publicKey, privateKey);
  let sent = 0, expired = 0, failed = 0;
  for (const row of jobs || []) {
    const n = nmap.get(row.notification_id); const s = smap.get(row.subscription_id);
    if (!n || !s || !s.active) continue;
    const claimed = await db.rpc("claim_push_delivery_job", { p_job_id: row.id });
    if (claimed.error || !claimed.data) continue;
    const order = n.related_order_id ? String(orderMap.get(n.related_order_id) || "") : "";
    const type = String(n.type || "");
    const action = /replacement|unavailable|payment/i.test(`${type} ${n.title}`);
    const urlPath = order ? `/#/${action ? "order" : "track"}/${encodeURIComponent(order)}` : "/#/orders";
    const tag = `${action ? "dropzyy-order-action" : /refund|payment|financial/i.test(`${type} ${n.title}`) ? "dropzyy-order-financial" : "dropzyy-order-progress"}-${order || n.id}`;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: n.title, body: n.message, type, order_id: n.related_order_id || null, order_number: order || null, target_url: urlPath, data: { url: urlPath, target_url: urlPath, order_id: n.related_order_id || null, order_number: order || null, type } }), { TTL: 86400 });
      await db.from("push_delivery_jobs").update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null }).eq("id", row.id).eq("status", "processing");
      sent++;
    } catch (e) {
      const status = Number((e as { statusCode?: number })?.statusCode || 0);
      const permanent = status === 404 || status === 410 || (status >= 400 && status < 500 && status !== 429);
      if (permanent) { await db.from("push_subscriptions").update({ active: false, updated_at: new Date().toISOString() }).eq("id", s.id); await db.from("push_delivery_jobs").update({ status: "expired", last_error: `provider ${status}`, updated_at: new Date().toISOString() }).eq("id", row.id); expired++; }
      else { const next = new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** Math.min(5, Number(claimed.data.attempts || 1)) * 60 * 1000)).toISOString(); await db.from("push_delivery_jobs").update({ status: Number(claimed.data.attempts || 0) >= 5 ? "failed" : "retryable", available_at: next, last_error: String(e).slice(0,500), updated_at: new Date().toISOString() }).eq("id", row.id); failed++; }
    }
  }
  return json({ considered: jobs?.length || 0, sent, expired, failed });
}

Deno.serve(req => main(req).catch(e => json({ error: String(e) }, 500)));
