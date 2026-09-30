import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyVerifiedTransfer } from "../_shared/transfer-reconciliation.mjs";

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
  const [settlementResult, reimbursementResult] = await Promise.all([
    db.rpc("claim_stale_settlement_transfers", { p_batch_size: 25 }),
    db.rpc("claim_stale_customer_reimbursement_transfers", { p_batch_size: 25 }),
  ]);
  if (settlementResult.error || reimbursementResult.error) return out(500, { error: "Transfer claim failed" });

  const claims = [
    ...(settlementResult.data ?? []).map((claim: any) => ({ ...claim, transfer_code: null, amount_kobo: null, currency: null, recipient_code: null })),
    ...(reimbursementResult.data ?? []),
  ];
  const results = [];
  for (const claim of claims ?? []) {
    try {
      const provider = await fetch(`https://api.paystack.co/transfer/verify/${encodeURIComponent(claim.paystack_reference)}`, { headers: { Authorization: `Bearer ${SECRET}` } });
      const payload = await provider.json().catch(() => ({}));
      if (!provider.ok || !payload?.status) throw new Error(payload?.message || `Paystack HTTP ${provider.status}`);
      const d = payload.data ?? {};
      const verified = classifyVerifiedTransfer(d, {
        reference: claim.paystack_reference,
        amountKobo: claim.amount_kobo,
        currency: claim.currency,
        recipientCode: claim.recipient_code,
        transferCode: claim.transfer_code,
      });
      if (verified.kind === "unknown") {
        results.push({ transfer_id: claim.transfer_id, status: "unknown", reason: verified.reason });
        continue;
      }
      if (verified.kind === "in_flight") {
        results.push({ transfer_id: claim.transfer_id, status: verified.status });
        continue;
      }
      const { data: identity, error: identityError } = await db.rpc("validate_transfer_provider_event", {
        p_reference: claim.paystack_reference,
        p_transfer_code: verified.transferCode,
        p_amount_kobo: verified.amount,
        p_currency: verified.currency,
        p_recipient_code: verified.recipientCode,
      });
      if (identityError || !identity?.valid || identity.transfer_id !== claim.transfer_id) {
        results.push({ transfer_id: claim.transfer_id, status: "unknown", reason: "local transfer identity mismatch" });
        continue;
      }
      const applied = await db.rpc("apply_transfer_webhook_event", {
        p_reference: claim.paystack_reference,
        p_transfer_code: typeof d.transfer_code === "string" ? d.transfer_code : null,
        p_event_status: verified.status,
        p_payload: d,
      });
      if (applied.error) throw applied.error;
      results.push({ transfer_id: claim.transfer_id, status: applied.data });
    } catch (err) {
      console.error("paystack-transfer-reconcile: provider lookup failed", { transfer_id: claim.transfer_id, message: err?.message ?? "unknown" });
      if (claim.amount_kobo === null) {
        // Preserve the existing settlement reconciliation retry behavior.
        await db.from("transfers").update({ provider_reconciliation_claimed_at: null }).eq("id", claim.transfer_id).eq("status", "processing");
      }
      // Reimbursement lookup failures retain their claim timestamp as a
      // bounded 30-minute backoff. Neither path resubmits a payout here.
      results.push({ transfer_id: claim.transfer_id, status: "unknown", error: "provider lookup failed" });
    }
  }
  return out(200, { checked: results.length, results });
});
