import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");
const WORKER_SECRET = Deno.env.get("REFUND_RECONCILIATION_WORKER_SECRET");

const response = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response(405, { error: "Method not allowed" });
  if (!URL || !SERVICE || !SECRET || !WORKER_SECRET) return response(500, { error: "Server configuration error" });
  if (req.headers.get("apikey") !== WORKER_SECRET || (req.headers.get("Authorization") && req.headers.get("Authorization") !== `Bearer ${WORKER_SECRET}`)) return response(401, { error: "Unauthorized" });
  const body = await req.json().catch(() => ({}));
  if (Object.keys(body).length) return response(400, { error: "This worker accepts no request body" });
  const db = createClient(URL, SERVICE);
  const { data: claims, error } = await db.rpc("claim_stale_refunds_for_reconciliation", { p_batch_size: 25 });
  if (error) return response(500, { error: "Refund claim failed" });
  const results = [];
  for (const claim of claims ?? []) {
    try {
      const provider = await fetch(`https://api.paystack.co/refund/${encodeURIComponent(claim.gateway_refund_id)}`, { headers: { Authorization: `Bearer ${SECRET}` } });
      const payload = await provider.json().catch(() => ({}));
      if (!provider.ok || !payload?.status) throw new Error(payload?.message || `Paystack HTTP ${provider.status}`);
      const data = payload.data ?? {};
      const status = String(data.status ?? "").toLowerCase();
      const applied = await db.rpc("apply_provider_refund_event", {
        p_provider_status: status,
        p_provider_ref: String(data.id ?? data.reference ?? claim.gateway_refund_id),
        p_transaction_ref: data.transaction ? String(typeof data.transaction === "object" ? data.transaction.id ?? data.transaction.reference : data.transaction) : null,
        p_amount_kobo: Number.isFinite(Number(data.amount)) ? Number(data.amount) : null,
        p_currency: data.currency ?? null,
      });
      if (applied.error) throw applied.error;
      results.push({ refund_id: claim.refund_id, status: applied.data?.status ?? status });
    } catch (err) {
      console.error("paystack-refund-reconcile: provider lookup failed", { refund_id: claim.refund_id, message: err?.message ?? "unknown" });
      await db.from("refunds").update({ provider_reconciliation_claimed_at: null }).eq("id", claim.refund_id).in("status", ["pending", "processing"]);
      results.push({ refund_id: claim.refund_id, error: "provider lookup failed" });
    }
  }
  return response(200, { reconciled: results.length, results });
});
