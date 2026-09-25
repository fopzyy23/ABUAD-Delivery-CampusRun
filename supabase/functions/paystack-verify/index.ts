// ============================================================
// Dropzyy — Paystack Payment Verification / Recovery (server-side)
// ============================================================
// PURPOSE
//   Lets an authenticated caller RECOVER a payment whose Paystack webhook
//   was delayed or never arrived. This function is a verifier only: it never
//   writes payment or order state itself. Settlement is performed by the
//   authoritative, service-role-only success RPCs, exactly as the webhook
//   does — so there is ONE state machine, not two.
//
// TRUST MODEL
//   * The browser sends ONLY { "reference": "..." }. Nothing else is read:
//     no order id, amount, currency, transaction id, status, fee, channel or
//     paid_at. Every settlement value comes from public.payments /
//     public.orders (service role) or from Paystack's own verify response.
//   * The caller's JWT is validated with supabase.auth.getUser(), and the
//     payment's order must belong to that caller. Ownership is the SAME rule
//     the project already uses for the payment type:
//       - product          -> orders.user_id must equal the caller
//                             (the customer who created the order)
//       - vendor_delivery  -> the caller must be the VENDOR that owns an
//                             order_item on the order, which is the rule
//                             paystack-initialize-delivery already enforces
//                             (the vendor, not the customer, pays the
//                             ₦1,500 rider delivery fee).
//   * FAIL-CLOSED: the success RPC is called ONLY after Paystack
//     independently confirms a successful charge for that exact reference,
//     amount and currency. Anything ambiguous leaves the payment pending.
//   * A payment that is already 'success' is reported as settled without a
//     second RPC call (the RPC is idempotent and would return immediately).
//     A payment in 'failed' / 'refunded' is never converted back to success.
//
// WHAT CALLERS GET BACK
//   Reconciliation information only: ok, verified, reference, status,
//   order_id, payment_type (+ already_settled / reason / paystack_status).
//   Never the Paystack secret key, never raw provider payloads, never
//   unrelated internal rows.
//
// Required environment variables (Supabase Dashboard -> Edge Functions -> Secrets):
//   PAYSTACK_SECRET_KEY        Paystack secret key (starts with sk_live_ or sk_test_)
//   SUPABASE_URL               Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  Supabase service-role key (server-side ONLY)
//   ALLOWED_ORIGIN             Comma-separated CORS origin allowlist (no wildcard)
//
// Deploy:  supabase functions deploy paystack-verify
//          (browser-facing: keep JWT verification ON — never --no-verify-jwt)
// Invoke:  POST {SUPABASE_URL}/functions/v1/paystack-verify
// Body:    { "reference": "dropzyy_CR-XXXXXXXXXXXX_1699999999999" }
// Header:  Authorization: Bearer <user-jwt>
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MAX_JSON_BODY_BYTES = 16 * 1024;

// The reference is the ONLY client input. This pattern only validates the
// lookup key (the project's own references look like
// `dropzyy_CR-XXXXXXXXXXXX_<epoch-ms>` / `dropzyy_delivery_VR-...`), so a
// malformed key is rejected before it reaches the database or Paystack.
const MAX_REFERENCE_LENGTH = 128;
const REFERENCE_PATTERN = /^[A-Za-z0-9._=:+-]+$/;

// The project settles in NGN only (payments.currency defaults to 'NGN').
const EXPECTED_CURRENCY = "NGN";

const ALLOWED_ORIGINS: string[] = (
  Deno.env.get("ALLOWED_ORIGIN") ??
    "https://dropzyyy.netlify.app,http://127.0.0.1:5500"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  // Echo the origin only for allowlisted callers; otherwise omit the header
  // entirely so the browser blocks the response. Never a wildcard.
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

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_JSON_BODY_BYTES) {
    return json(req, 413, { error: "Request body too large" });
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return json(req, 415, { error: "Content-Type must be application/json" });
  }
  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("paystack-verify: missing required environment variable(s).");
    return json(req, 500, { error: "Server configuration error" });
  }

  try {
    // ---- 1. Authenticated users only — anonymous verification is refused ----
    const authHeader = req.headers.get("authorization") ?? "";
    if (!/^Bearer\s+\S+$/i.test(authHeader)) {
      return json(req, 401, { error: "Missing or invalid Authorization header" });
    }
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) {
      return json(req, 401, { error: "Invalid or expired token" });
    }

    // ---- 2. Body: the reference is the ONLY accepted input ----
    let body: { reference?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(req, 400, { error: "Invalid JSON body" });
    }
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    if (
      !reference ||
      reference.length > MAX_REFERENCE_LENGTH ||
      !REFERENCE_PATTERN.test(reference)
    ) {
      return json(req, 400, { error: "reference is required" });
    }

    // ---- 3. Authoritative payment row (service role, never the browser) ----
    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .select("id, order_id, reference, amount, currency, status, payment_type")
      .eq("reference", reference)
      .maybeSingle();

    if (payErr) {
      console.error("paystack-verify: payment lookup failed");
      return json(req, 500, { error: "Reconciliation temporarily unavailable" });
    }
    if (!payment) {
      console.warn(`paystack-verify: unknown reference ${reference}`);
      return json(req, 404, { error: "Unknown payment reference" });
    }

    // 'product' | 'vendor_delivery' — decides which success RPC settles it.
    const isVendorDelivery = payment.payment_type === "vendor_delivery";

    // ---- 4. Only reconcile payments that can still be reconciled ----
    if (payment.status === "success") {
      // Idempotent: already settled (webhook or an earlier verification). The
      // success RPC returns immediately for this state, so it is not re-called.
      console.log(
        `paystack-verify: ${payment.payment_type} payment ${payment.reference} already settled`,
      );
      return json(req, 200, {
        ok: true,
        verified: true,
        reference: payment.reference,
        status: "success",
        order_id: payment.order_id,
        payment_type: payment.payment_type,
        already_settled: true,
      });
    }
    if (payment.status !== "pending") {
      // failed / refunded — a terminal non-successful ledger state must never
      // be converted into a success by this endpoint.
      console.warn(
        `paystack-verify: payment ${payment.reference} is ${payment.status} — not reconcilable`,
      );
      return json(req, 409, {
        ok: false,
        verified: false,
        reference: payment.reference,
        status: payment.status,
        order_id: payment.order_id,
        payment_type: payment.payment_type,
        reason: "payment_not_reconcilable",
      });
    }

    // ---- 5. Resolve the order and prove the caller is entitled to it ----
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, user_id, request_type, delivery_method")
      .eq("id", payment.order_id)
      .maybeSingle();

    if (orderErr) {
      console.error("paystack-verify: order lookup failed");
      return json(req, 500, { error: "Reconciliation temporarily unavailable" });
    }
    if (!order) {
      console.error(`paystack-verify: order ${payment.order_id} not found`);
      return json(req, 404, { error: "Order not found for this payment" });
    }

    // Reusable refusal payload: reconciliation facts only, never internals.
    const refuse = (
      statusCode: number,
      reason: string,
      extra: Record<string, unknown> = {},
    ): Response =>
      json(req, statusCode, {
        ok: false,
        verified: false,
        reference: payment.reference,
        status: payment.status,
        order_id: payment.order_id,
        payment_type: payment.payment_type,
        reason,
        ...extra,
      });

    if (isVendorDelivery) {
      // Delivery fees are VENDOR-owned: vendor_request orders are created by
      // the customer (orders.user_id = customer) while the vendor pays the
      // ₦1,500 fee. Ownership therefore follows the same rule that created the
      // payment — the caller's vendor must own an item on this order.
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("vendor_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profileErr) {
        console.error("paystack-verify: vendor profile lookup failed");
        return json(req, 500, { error: "Reconciliation temporarily unavailable" });
      }
      if (!profile?.vendor_id) {
        return refuse(403, "not_order_owner");
      }

      const { data: ownedItem, error: itemErr } = await supabase
        .from("order_items")
        .select("id")
        .eq("order_id", order.id)
        .eq("vendor_id", profile.vendor_id)
        .limit(1)
        .maybeSingle();
      if (itemErr) {
        console.error("paystack-verify: vendor order-item lookup failed");
        return json(req, 500, { error: "Reconciliation temporarily unavailable" });
      }
      if (!ownedItem) {
        return refuse(403, "not_order_owner");
      }

      // Mirror the webhook's order-shape guard, so an order that is no longer a
      // vendor rider delivery is refused cleanly instead of raising in the RPC.
      if (
        order.request_type !== "vendor_request" ||
        order.delivery_method !== "rider"
      ) {
        return refuse(409, "order_not_vendor_rider_delivery");
      }
    } else if (order.user_id !== user.id) {
      // Product payments belong to the customer who created the order.
      return refuse(403, "not_order_owner");
    }

    // ---- 6. Independent Paystack verification (server-to-server) ----
    // GET https://api.paystack.co/transaction/verify/{reference}
    let paystackRes: Response;
    try {
      paystackRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { "Authorization": `Bearer ${PAYSTACK_SECRET_KEY}` } },
      );
    } catch (netErr) {
      console.error("paystack-verify: Paystack verify request failed", netErr);
      return refuse(502, "paystack_unreachable");
    }

    const paystackBody = await paystackRes.json().catch(() => ({}));
    if (!paystackRes.ok || !paystackBody?.status || !paystackBody?.data) {
      console.error(`paystack-verify: Paystack verify HTTP ${paystackRes.status}`);
      return refuse(502, "paystack_verification_failed");
    }

    const data = paystackBody.data;
    const paystackStatus = typeof data?.status === "string" ? data.status : "";
    const paystackReference = typeof data?.reference === "string" ? data.reference : "";
    const paystackCurrency = typeof data?.currency === "string" ? data.currency : "";
    const paystackAmount = data?.amount; // kobo, as sent by Paystack
    const paystackTransactionId = data?.id;

    // The ledger stores amounts in NAIRA (create_pending_payment /
    // create_vendor_delivery_payment) while Paystack speaks KOBO. The project
    // already reconciles the two this way — paystack-webhook compares against
    // order.total * 100 (and 150000 for the ₦1,500 delivery fee) and
    // paystack-refund uses payment.amount * 100 — so the same convention is
    // used here, which also equals the delivery-fee constant exactly.
    const expectedKobo = Math.round(Number(payment.amount) * 100);

    // ---- 7. Validate EVERYTHING before touching the success RPCs ----
    if (!Number.isSafeInteger(expectedKobo) || expectedKobo <= 0) {
      console.error(`paystack-verify: stored amount unusable for ${payment.reference}`);
      return refuse(409, "amount_not_verifiable");
    }
    if (paystackStatus !== "success") {
      // pending / abandoned / failed / reversed at the provider — never settle.
      console.warn(
        `paystack-verify: reference ${payment.reference} is '${paystackStatus}' at Paystack`,
      );
      return refuse(409, "paystack_not_successful", { paystack_status: paystackStatus });
    }
    if (paystackReference !== payment.reference) {
      console.error(`paystack-verify: reference mismatch for ${payment.reference}`);
      return refuse(409, "reference_mismatch");
    }
    if (
      typeof paystackAmount !== "number" ||
      !Number.isInteger(paystackAmount) ||
      paystackAmount !== expectedKobo
    ) {
      console.error(
        `paystack-verify: amount mismatch for ${payment.reference}: ` +
          `expected ${expectedKobo} kobo, got ${paystackAmount}`,
      );
      return refuse(409, "amount_mismatch");
    }
    if (paystackCurrency !== EXPECTED_CURRENCY || payment.currency !== EXPECTED_CURRENCY) {
      console.error(`paystack-verify: currency mismatch for ${payment.reference}`);
      return refuse(409, "currency_mismatch");
    }
    if (
      typeof paystackTransactionId !== "number" ||
      !Number.isSafeInteger(paystackTransactionId) ||
      paystackTransactionId <= 0
    ) {
      console.error(`paystack-verify: missing transaction id for ${payment.reference}`);
      return refuse(409, "invalid_transaction_id");
    }

    // ---- 8. Settle through the existing authoritative success RPCs ----
    // Those RPCs are service-role-only and own EVERY state transition
    // (payments.status / transaction_id / paystack_*, orders.payment_status,
    // orders.delivery_payment_status, orders.payment_reference,
    // orders.transaction_id). This function never writes those columns.
    const paystackFeeKobo =
      typeof data?.fees === "number" && Number.isFinite(data.fees) ? data.fees : null;
    const paystackChannel = typeof data?.channel === "string" ? data.channel : null;
    const paystackPaidAt = typeof data?.paid_at === "string" ? data.paid_at : null;

    const rpcParams = {
      p_reference: payment.reference,
      p_transaction_id: String(paystackTransactionId),
      p_order_id: payment.order_id,
      p_paystack_amount: paystackAmount,
      p_paystack_fee: paystackFeeKobo,
      p_paystack_channel: paystackChannel,
      p_paystack_paid_at: paystackPaidAt,
    };

    // Route to the success RPC that owns this payment type:
    //   product          -> handle_paystack_payment_success
    //   vendor_delivery  -> handle_vendor_delivery_payment_success
    const { error: rpcErr } = isVendorDelivery
      ? await supabase.rpc("handle_vendor_delivery_payment_success", rpcParams)
      : await supabase.rpc("handle_paystack_payment_success", rpcParams);

    if (rpcErr) {
      // Paystack verified the charge but local settlement failed — report it
      // truthfully so the caller can retry. Each RPC is a single transaction,
      // so no partial state was written.
      console.error("paystack-verify: success RPC failed:", rpcErr.message ?? rpcErr);
      return json(req, 500, {
        ok: false,
        verified: true,
        reference: payment.reference,
        status: payment.status,
        order_id: payment.order_id,
        payment_type: payment.payment_type,
        error: "payment settlement failed",
      });
    }

    console.log(`paystack-verify: settled ${payment.payment_type} payment ${payment.reference}`);
    return json(req, 200, {
      ok: true,
      verified: true,
      reference: payment.reference,
      status: "success",
      order_id: payment.order_id,
      payment_type: payment.payment_type,
    });
  } catch (err) {
    console.error("paystack-verify: unexpected error", err);
    return json(req, 500, { error: "Internal server error" });
  }
});
