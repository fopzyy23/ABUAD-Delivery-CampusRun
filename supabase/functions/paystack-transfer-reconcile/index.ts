import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");
const WORKER_SECRET = Deno.env.get("TRANSFER_RECONCILIATION_WORKER_SECRET");
const out = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return out(405, { error: "Method not allowed" });
  if (!URL || !SERVICE || !SECRET || !WORKER_SECRET) return out(500, { error: "Server configuration error" });
  if (req.headers.get("apikey") !== WORKER_SECRET || (req.headers.get("Authorization") && req.headers.get("Authorization") !== `Bearer ${WORKER_SECRET}`)) return out(401, { error: "Unauthorized" });
  const body = await req.json().catch(() => ({}));
  if (Object.keys(body).length) return out(400, { error: "This worker accepts no request body" });
  const db = createClient(URL, SERVICE);
  const { data: claims, error } = await db.rpc("claim_stale_settlement_transfers", { p_batch_size: 25 });
  if (error) return out(500, { error: "Transfer claim failed" });
  const results = [];
  for (const claim of claims ?? []) {
    try {
      const provider = await fetch(`https://api.paystack.co/transfer/verify/${encodeURIComponent(claim.paystack_reference)}`, { headers: { Authorization: `Bearer ${SECRET}` } });
      const payload = await provider.json().catch(() => ({}));
      if (!provider.ok || !payload?.status) throw new Error(payload?.message || `Paystack HTTP ${provider.status}`);
      const d = payload.data ?? {};
      const mapped = ({ success: "success", failed: "failed", reversed: "reversed" } as Record<string, string>)[String(d.status ?? "").toLowerCase()];
      if (!mapped) { results.push({ transfer_id: claim.transfer_id, status: d.status ?? "pending" }); continue; }
      const applied = await db.rpc("apply_transfer_webhook_event", {
        p_reference: claim.paystack_reference,
        p_transfer_code: typeof d.transfer_code === "string" ? d.transfer_code : null,
        p_event_status: mapped,
        p_payload: d,
      });
      if (applied.error) throw applied.error;
      results.push({ transfer_id: claim.transfer_id, status: applied.data });
    } catch (err) {
      console.error("paystack-transfer-reconcile: provider lookup failed", { transfer_id: claim.transfer_id, message: err?.message ?? "unknown" });
      await db.from("transfers").update({ provider_reconciliation_claimed_at: null }).eq("id", claim.transfer_id).eq("status", "processing");
      results.push({ transfer_id: claim.transfer_id, error: "provider lookup failed" });
    }
  }
  return out(200, { reconciled: results.length, results });
});
