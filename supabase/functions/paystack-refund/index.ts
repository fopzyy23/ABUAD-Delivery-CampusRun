// ============================================================
// Dropzyy — Paystack Refund Execution (server-side)
// ============================================================
// Executes a Paystack refund for an EXISTING approved refund
// request. Admin-only (JWT role check). Accepts ONLY the
// refund_id — every refund value (amount, transaction_id,
// reference) is loaded from the authoritative database.
//
// Required environment variables:
//   PAYSTACK_SECRET_KEY        Paystack secret key (sk_live_/sk_test_)
//   SUPABASE_URL               Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  Supabase service-role key
//   ALLOWED_ORIGIN             Comma-separated origin allowlist (no wildcard)
//
// Deploy:  supabase functions deploy paystack-refund
// Invoke:  POST {SUPABASE_URL}/functions/v1/paystack-refund
// Body:    { "refund_id": "<uuid of approved refunds row>" }
// Header:  Authorization: Bearer <admin-user-jwt>
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
    console.error("paystack-refund: missing required environment variable(s).");
    return json(req, 500, { error: "Server configuration error" });
  }
  try {
    // ---- Authenticate: only an admin may execute a refund ----
    // Caller authentication is kept SEPARATE from the trusted service-role
    // client. All protected DB operations below run as service_role; the
    // caller's JWT is used ONLY to validate identity and to evaluate the
    // admin check. The service-role key never reaches the browser.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return json(req, 401, { error: "Missing or invalid Authorization header" });
    }
    const jwt = authHeader.slice("Bearer ".length).trim();
    if (!jwt) {
      return json(req, 401, { error: "Missing or invalid Authorization header" });
    }

    // Pure service-role client for all trusted server-side DB operations.
    // No global Authorization override — refund/payment lookups and
    // apply_refund_result() execute under service_role (RLS bypassed by
    // design for this trusted server-side function).
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate the caller's JWT against Supabase Auth.
    const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !authUser) {
      return json(req, 401, { error: "Invalid or expired token" });
    }

    // Verify the caller is an admin using the existing is_admin() security
    // model. is_admin() reads auth.uid(), which is only set inside the
    // caller's authenticated context, so this single boolean check runs on a
    // user-scoped client. It returns no data, just the admin flag.
    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_admin");
    if (adminErr || !isAdmin) {
      return json(req, 403, { error: "permission denied: admin privileges required" });
    }
    // ---- Input: ONLY the refund identifier ----
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(req, 400, { error: "Invalid JSON body" });
    }
    const refundId = body.refund_id;
    if (
      typeof refundId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refundId)
    ) {
      return json(req, 400, { error: "refund_id (uuid) is required" });
    }
    const forbidden = ["amount", "transaction_id", "reference", "payment_id", "reason"];
    const supplied = forbidden.filter((k) => body[k] !== undefined);
    if (supplied.length > 0) {
      return json(req, 400, {
        error: "Refund values are server-authoritative and cannot be supplied",
      });
    }
    // ---- Load the refund record ----
    const { data: refund, error: refundErr } = await supabase
      .from("refunds")
      .select("id, payment_id, order_id, amount, status, reason")
      .eq("id", refundId)
      .single();
    if (refundErr || !refund) {
      return json(req, 404, { error: "Refund not found" });
    }
    // ---- Validate refund status ----
    if (refund.status === "processed" || refund.status === "rejected") {
      return json(req, 200, {
        refund_id: refundId,
        status: refund.status,
        already_processed: true,
        message: `Refund already in terminal state '${refund.status}'`,
      });
    }
    if (refund.status === "failed") {
      return json(req, 409, {
        refund_id: refundId,
        status: refund.status,
        message: "Refund previously failed — review and re-approve before retrying",
      });
    }
    if (refund.status !== "approved") {
      return json(req, 409, {
        refund_id: refundId,
        status: refund.status,
        message: `Refund has status '${refund.status}' — only 'approved' refunds can be executed`,
      });
    }
    // ---- Load the payment record ----
    const { data: payment, error: paymentErr } = await supabase
      .from("payments")
      .select("id, reference, transaction_id, amount, currency, status")
      .eq("id", refund.payment_id)
      .single();
    if (paymentErr || !payment) {
      console.error(`paystack-refund: payment ${refund.payment_id} not found`);
      return json(req, 409, { error: "Associated payment record not found" });
    }
    if (!payment.transaction_id) {
      console.error(`paystack-refund: payment ${payment.id} has no transaction_id`);
      return json(req, 409, { error: "Payment has no Paystack transaction_id — cannot refund" });
    }
    // ---- Call Paystack's refund endpoint ----
    const paystackRes = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: payment.transaction_id,
        merchant_note: refund.reason ?? "Customer refund request",
      }),
    });
    const paystackBody = await paystackRes.json().catch(() => ({}));
    if (!paystackRes.ok || !paystackBody?.status) {
      console.error(
        `paystack-refund: Paystack HTTP ${paystackRes.status}:`,
        paystackBody?.message ?? "unknown",
      );
      const refundReason = paystackBody?.message
        ? `Paystack error: ${paystackBody.message}`
        : "Paystack refund request failed";
      const { error: resultErr } = await supabase.rpc("apply_refund_result", {
        p_refund_id: refundId,
        p_success: false,
        p_reason: refundReason,
        p_gateway_refund_id: null,
      });
      if (resultErr) {
        console.error("paystack-refund: apply_refund_result failed:", resultErr);
      }
      return json(req, 502, {
        error: "Paystack refund request failed",
        refund_id: refundId,
        status: "failed",
        paystack_message: paystackBody?.message ?? "unknown error",
      });
    }
    // ---- Paystack accepted the refund ----
    const gatewayRefundId = paystackBody?.data?.id
      ? String(paystackBody.data.id)
      : (paystackBody?.data?.reference ?? null);
    const { error: resultErr } = await supabase.rpc("apply_refund_result", {
      p_refund_id: refundId,
      p_success: true,
      p_reason: refund.reason ?? "Refund processed successfully",
      p_gateway_refund_id: gatewayRefundId,
    });
    if (resultErr) {
      console.error("paystack-refund: apply_refund_result failed:", resultErr);
      return json(req, 200, {
        refund_id: refundId,
        status: "processed",
        warning: "Paystack accepted refund but local record update failed — investigate",
        gateway_refund_id: gatewayRefundId,
      });
    }
    return json(req, 200, {
      refund_id: refundId,
      status: "processed",
      gateway_refund_id: gatewayRefundId,
      amount: refund.amount,
      message: "Refund processed successfully",
    });
  } catch (err) {
    console.error("paystack-refund: unexpected error", err);
    return json(req, 500, { error: "Internal server error" });
  }
});