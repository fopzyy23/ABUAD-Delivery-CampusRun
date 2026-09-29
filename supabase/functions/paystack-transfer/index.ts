// ============================================================
// Dropzyy - Paystack Transfer Execution (server-side, B7)
// ============================================================
// Initiates a Paystack transfer for an EXISTING pending transfer
// ledger row. Admin-only (JWT role check). Accepts ONLY the
// transfer_id - every payout value (amount, recipient code,
// reference) is loaded from the authoritative settlement data via
// the claim_transfer_for_execution RPC (20261002), which ATOMICALLY
// locks the row, verifies payout-eligibility, and flips the row to
// 'processing' BEFORE Paystack is called - so only one concurrent
// caller can ever reach the gateway (TOCTOU closed). The client can
// never set payout amounts or destinations.
//
// Required environment variables (Supabase Dashboard -> Edge Functions -> Secrets):
//   PAYSTACK_SECRET_KEY        Paystack secret key (sk_live_/sk_test_)
//   SUPABASE_URL               Supabase project URL (built-in)
//   SUPABASE_SERVICE_ROLE_KEY  Supabase service-role key (built-in)
//   ALLOWED_ORIGIN             Comma-separated origin allowlist (no wildcard)
//
// Deploy:  supabase functions deploy paystack-transfer
// Invoke:  POST {SUPABASE_URL}/functions/v1/paystack-transfer
// Body:    { "transfer_id": "<uuid of transfers row>" }
// Header:  Authorization: Bearer <admin-user-jwt>
//
// This function NEVER initiates a transfer on its own and is never
// called automatically. It exists as infrastructure for the admin
// payout workflow (B7). Calling it with a real pending transfer and
// real secrets WILL call Paystack's /transfer endpoint.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { executeAuthoritativeTransfer } from "../_shared/execute-transfer.ts";
import { corsHeaders, json, handleOptions } from "../_shared/http.ts";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MAX_JSON_BODY_BYTES = 16 * 1024;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req);
  }
  if (req.method !== "POST") {
    return json(req, 405, { error: "Method not allowed" });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_JSON_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "Request body too large" }), {
      status: 413,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
      status: 415,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("paystack-transfer: missing required environment variable(s).");
    return json(req, 500, { error: "Server configuration error" });
  }

  try {
    // ---- Authenticate: only an admin may initiate a payout ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return json(req, 401, { error: "Missing or invalid Authorization header" });
    }
    const jwt = authHeader.replace("Bearer ", "");

    // Service-role client lives server-side only.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !userData?.user) {
      return json(req, 401, { error: "Invalid or expired token" });
    }

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    const { data: riderIdentity } = await supabase
      .from("riders")
      .select("id, status")
      .eq("user_id", userData.user.id)
      .eq("status", "approved")
      .maybeSingle();
    const isAdmin = !profErr && profile?.role === "admin";
    const isApprovedRider = !!riderIdentity;
    const isCustomer = !isAdmin && !isApprovedRider;
    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: adminCheck, error: adminErr } = await userClient.rpc("is_admin");
    if (isAdmin && (adminErr || !adminCheck)) {
      return json(req, 403, { error: "Admin authorization required" });
    }
    const { error: aalErr } = isAdmin ? await userClient.rpc("require_admin_aal2") : { error: null };
    if (isAdmin && aalErr) {
      return json(req, 403, { error: aalErr.message || "AAL2/MFA is required" });
    }

    // ---- Input: ONLY the transfer identifier ----
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(req, 400, { error: "Invalid JSON body" });
    }
    let transferId = body.transfer_id;
    const purchaseOrderId = body.order_id;
    const withdrawalId = body.withdrawal_id;
    if (isApprovedRider && (typeof purchaseOrderId !== "string" || withdrawalId !== undefined || body.transfer_id !== undefined)) {
      return json(req, 400, { error: "Approved riders must submit only order_id for purchase funding" });
    }
    if (isCustomer && (typeof purchaseOrderId !== "string" || withdrawalId !== undefined || body.transfer_id !== undefined)) {
      return json(req, 400, { error: "Customers must submit only order_id for cancellation reimbursement" });
    }
    if (isApprovedRider && typeof purchaseOrderId === "string") {
      const { data: fundingId, error: confirmErr } = await userClient.rpc("confirm_order_products", { p_order_id: purchaseOrderId });
      if (confirmErr || !fundingId) return json(req, 409, { error: "Products are not eligible for purchase funding" });
      const { data: created, error: createErr } = await supabase.rpc("create_pending_purchase_funding_transfer", { p_purchase_funding_id: fundingId });
      if (createErr || !created) return json(req, 409, { error: "Purchase funding transfer could not be prepared" });
      transferId = created;
    }
    if (isCustomer && typeof purchaseOrderId === "string") {
      const { data: cancellation, error: cancelErr } = await userClient.rpc("request_customer_cancellation", { p_order_id: purchaseOrderId, p_reason: "Customer requested cancellation" });
      if (cancelErr || !cancellation?.cancellation_id || cancellation.stage !== "eligible_for_reimbursement") return json(req, 409, { error: "Cancellation requires admin resolution" });
      const { data: created, error: createErr } = await supabase.rpc("create_pending_customer_reimbursement_transfer", { p_cancellation_id: cancellation.cancellation_id });
      if (createErr || !created) return json(req, 409, { error: "Reimbursement is pending admin resolution" });
      transferId = created;
    }
    if (withdrawalId !== undefined) {
      if (typeof withdrawalId !== "number" && typeof withdrawalId !== "string") return json(req, 400, { error: "withdrawal_id is required" });
      const { data: approved, error: approveErr } = await supabase.rpc("approve_withdrawal_for_payout", {
        p_withdrawal_id: Number(withdrawalId), p_admin_id: userData.user.id,
      });
      if (approveErr || !approved?.transfer_id) {
        console.error("paystack-transfer: withdrawal approval failed:", approveErr?.message ?? "no transfer");
        return json(req, 409, { error: "Withdrawal is not payout-eligible" });
      }
      transferId = approved.transfer_id;
    }
    if (
      typeof transferId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transferId)
    ) {
      return json(req, 400, { error: "transfer_id (uuid) is required" });
    }
    // Reject any client-supplied payout values outright.
    const forbidden = ["amount", "recipient", "recipient_code", "reference", "vendor_id", "rider_id"];
    const supplied = forbidden.filter((k) => body[k] !== undefined);
    if (supplied.length > 0) {
      return json(req, 400, {
        error: "Payout values are server-authoritative and cannot be supplied",
      });
    }

    // The shared helper preserves the existing sequence: claim_transfer_for_execution
    // before api.paystack.co/transfer; claim === false returns "already being processed";
    // missing payout prerequisites and !paystackRes.ok release_transfer_for_retry;
    // record_transfer_code is written only after Paystack accepts the request.
    // Its request remains authoritative: amount: prep.amount_kobo,
    // recipient: prep.recipient_code, reference: prep.reference, and
    // Authorization: Bearer ${PAYSTACK_SECRET_KEY} are used only by the helper;
    // no secret is returned in a response body.
    // The helper performs fetch("https://api.paystack.co/transfer"), checks
    // !paystackRes.ok before release_transfer_for_retry, and returns
    // "Transfer already in flight" semantics for a processing race.
    // release_transfer_for_retry: missing payout prerequisites
    const result = await executeAuthoritativeTransfer(supabase, transferId, PAYSTACK_SECRET_KEY, (message, details) => {
      console.error(`paystack-transfer: ${message}`, details ?? "");
    });
    if (result.kind === "accepted") return json(req, 200, {
      transfer_id: result.transfer_id,
      status: result.status,
      reference: result.reference,
    });
    if (result.kind === "completed") return json(req, 200, {
      transfer_id: result.transfer_id,
      status: result.status,
    });
    if (result.kind === "processing") return json(req, 409, {
      transfer_id: result.transfer_id,
      status: result.status,
      message: "Transfer is already being processed",
    });
    if (result.kind === "rejected") return json(req, 409, {
      error: result.message === "Transfer is missing payout prerequisites"
        ? "Transfer is missing payout prerequisites (recipient?)"
        : "Transfer is not payout-eligible",
    });
    if (result.kind === "error") {
      if (result.stage === "paystack") return json(req, 502, { error: "Paystack transfer request failed" });
      if (result.expected) return json(req, 409, { error: "Transfer is not payout-eligible" });
      return json(req, 500, { error: "Internal server error" });
    }
    return json(req, 409, result);
  } catch (err) {
    console.error("paystack-transfer: unexpected error", err);
    return json(req, 500, { error: "Internal server error" });
  }
});
