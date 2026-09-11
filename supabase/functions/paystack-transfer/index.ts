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

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// ---- CORS: env-driven origin allowlist (NO wildcard) ----
// Same model as paystack-initialize: the request Origin is echoed back
// ONLY when it appears in the comma-separated ALLOWED_ORIGIN secret.
const ALLOWED_ORIGINS: string[] = (
  Deno.env.get("ALLOWED_ORIGIN") ??
    "https://dropzyyy.netlify.app,http://127.0.0.1:5500"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin;
  return headers;
}

function json(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { error: "Method not allowed" });
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
    if (profErr || !profile || profile.role !== "admin") {
      return json(req, 403, { error: "Admin authorization required" });
    }

    // ---- Input: ONLY the transfer identifier ----
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(req, 400, { error: "Invalid JSON body" });
    }
    const transferId = body.transfer_id;
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

    // ---- Atomically claim + load the AUTHORITATIVE payout values ----
    // claim_transfer_for_execution() locks the row, refuses non-pending
    // transfers/settlements, verifies the order is Delivered, flips the
    // row to 'processing', and returns amount/recipient/reference
    // straight from the database — ALL before Paystack is called.
    // Exactly one concurrent request wins the claim; every other gets
    // claim=false and we abort before any external call (TOCTOU closed).
    const { data: prep, error: prepErr } = await supabase.rpc(
      "claim_transfer_for_execution",
      { p_transfer_id: transferId },
    );
    if (prepErr || !prep) {
      console.error("paystack-transfer: claim failed:", prepErr?.message ?? "no data");
      return json(req, 409, { error: "Transfer is not payout-eligible" });
    }
    if (prep.claim === false) {
      return json(req, 409, {
        transfer_id: transferId,
        status: prep.status ?? "processing",
        message: "Transfer is already being processed",
      });
    }
    if (!prep.recipient_code || !prep.reference || !prep.amount_kobo) {
      await supabase.rpc("release_transfer_for_retry", { p_transfer_id: transferId });
      return json(req, 409, { error: "Transfer is missing payout prerequisites (recipient?)" });
    }

    // ---- Call Paystack's transfer initiation endpoint ----
    const paystackRes = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: prep.amount_kobo,
        recipient: prep.recipient_code,
        reference: prep.reference,
        currency: prep.currency ?? "NGN",
        reason: `Dropzyy ${prep.payee_type} payout`,
      }),
    });

    const paystackBody = await paystackRes.json().catch(() => ({}));
    if (!paystackRes.ok || !paystackBody?.status) {
      // Paystack refused - roll the claimed row back to 'pending' so it
      // remains retryable (no ledger row is stranded mid-execution).
      console.error(
        `paystack-transfer: Paystack HTTP ${paystackRes.status}:`,
        paystackBody?.message ?? "unknown",
      );
      const { error: releaseErr } = await supabase.rpc("release_transfer_for_retry", {
        p_transfer_id: transferId,
      });
      if (releaseErr) {
        console.error("paystack-transfer: release_transfer_for_retry failed:", releaseErr.message);
      }
      return json(req, 502, { error: "Paystack transfer request failed" });
    }

    // ---- Record the Paystack transfer code on the claimed row ----
    const { error: recordErr } = await supabase.rpc("record_transfer_code", {
      p_transfer_id: transferId,
      p_transfer_code: paystackBody?.data?.transfer_code ?? null,
    });
    if (recordErr) {
      // Row moved elsewhere meanwhile (race) - do not claim success.
      console.error("paystack-transfer: record_transfer_code failed:", recordErr.message);
      return json(req, 409, { error: "Transfer already in flight" });
    }

    // ---- Return only safe acknowledgement fields ----
    return json(req, 200, {
      transfer_id: transferId,
      status: "processing",
      reference: prep.reference,
    });
  } catch (err) {
    console.error("paystack-transfer: unexpected error", err);
    return json(req, 500, { error: "Internal server error" });
  }
});