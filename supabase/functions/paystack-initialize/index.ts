// ============================================================
// Dropzyy � Paystack Transaction Initialization (server-side)
// ============================================================
// Initializes a Paystack transaction entirely server-side. The browser
// sends ONLY the order id + email � it can NEVER set the amount. The
// order total is read from the authoritative `orders` table and
// verified before the Paystack API call.
//
// Required environment variables (Supabase Dashboard -> Edge Functions -> Secrets):
//   PAYSTACK_SECRET_KEY        Paystack secret key (starts with sk_live_ or sk_test_)
//   SUPABASE_URL               Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  Supabase service-role key (server-side ONLY)
//   ALLOWED_ORIGIN             Comma-separated CORS origin allowlist
//                              (defaults to the production site + local dev)
//
// Deploy:  supabase functions deploy paystack-initialize
// Invoke:  POST {SUPABASE_URL}/functions/v1/paystack-initialize
// Body:    { "order_id": "<uuid>", "email": "user@example.com" }
// Header:  Authorization: Bearer <user-jwt>
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MAX_JSON_BODY_BYTES = 16 * 1024;
// ---- CORS: env-driven origin allowlist (NO wildcard) ----
// ALLOWED_ORIGIN is a comma-separated list of browser origins allowed to
// call this function, read from Edge Function environment/secrets, e.g.:
//   ALLOWED_ORIGIN=https://dropzyyy.netlify.app,http://127.0.0.1:5500
// The request Origin is echoed back ONLY when it is on the allowlist;
// requests from any other origin (or with no Origin header) get NO
// Access-Control-Allow-Origin header at all — never "*".
const ALLOWED_ORIGINS: string[] = (
  Deno.env.get("ALLOWED_ORIGIN") ??
    "https://dropzyyy.netlify.app,http://127.0.0.1:5500"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  // Echo the origin only for allowlisted callers; otherwise omit the
  // header entirely so the browser blocks the response.
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // Caches must not serve a CORS response keyed to a different Origin.
    "Vary": "Origin",
  };
  if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin;
  return headers;
}

// ---- Explicit Paystack callback (return) URL ----
// Paystack redirects the payer back to this URL after checkout and appends
// ?trxref=…&reference=… to it. We send it explicitly instead of relying on the
// dashboard default so the return route is always a Dropzyy route and the
// reference always lands somewhere the app can read it (the dashboard default
// pointed at the site root, where the old 0s meta-refresh redirect discarded
// the query string and the reference was lost).
//
// The origin is taken from the request's own Origin header ONLY when it is
// already on the CORS allowlist, so a preview deploy or local dev returns to
// itself and anything else falls back to the production return route. No new
// secret is required, and an unlisted origin can never steer the callback.
const DEFAULT_CALLBACK_URL =
  Deno.env.get("PAYSTACK_CALLBACK_URL") ?? "https://dropzyy.com/orders";

function resolveCallbackUrl(req: Request): string {
  const origin = req.headers.get("Origin") ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) return `${origin}/orders`;
  return DEFAULT_CALLBACK_URL;
}

// Paystack amounts are in kobo (1 Naira = 100 kobo).
function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
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

  // ---- Server configuration check ----
  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "paystack-initialize: missing required environment variable(s).",
    );
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    // ---- Authenticate the caller from the Bearer JWT ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid Authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }
    const jwt = authHeader.replace("Bearer ", "");

    // Service-role client lives server-side only; never exposed to the browser.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ---- Parse + validate request body ----
    let body: { order_id?: unknown; email?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const orderId = typeof body.order_id === "string" ? body.order_id.trim() : "";
    // The authenticated account email is authoritative; any client-supplied
    // email is intentionally ignored for Paystack initialization.
    const email = typeof user.email === "string" ? user.email.trim() : "";

    if (!orderId || !email) {
      return new Response(
        JSON.stringify({ error: "order_id and email are required" }),
        {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    // ---- Fetch the order SERVER-SIDE ----
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_number, user_id, total, payment_status, fee, subtotal")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ---- Verify ownership ----
    if (order.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Order does not belong to you" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ---- Verify the order is awaiting payment ----
    if (order.payment_status !== "pending") {
      return new Response(
        JSON.stringify({ error: `Order is not awaiting payment (status: ${order.payment_status})` }),
        {
          status: 409,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    // ---- Verify the order has items ----
    const { count: itemCount, error: itemsErr } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id);

    if (itemsErr || !itemCount) {
      return new Response(
        JSON.stringify({ error: "Order has no items" }),
        {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    // ---- Duplicate payment guard ----
    // If a valid pending payment with an authorization_url already exists,
    // reuse it rather than creating another charge (safe retry).
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("reference, authorization_url, access_code, status")
      .eq("order_id", order.id)
      .eq("status", "pending")
      .not("authorization_url", "is", null)
      .maybeSingle();

    if (existingPayment && existingPayment.authorization_url) {
      return new Response(
        JSON.stringify({
          authorization_url: existingPayment.authorization_url,
          access_code: existingPayment.access_code,
          reference: existingPayment.reference,
          reused: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    // ---- Generate a unique Paystack reference ----
    const reference = `dropzyy_${order.order_number}_${Date.now()}`;

    // ---- Explicit return URL (see resolveCallbackUrl) ----
    // ?trxref=/?reference= are appended by Paystack to this URL, so the return
    // lands on /orders where app.js can resolve the reference. The Netlify rule
    // for /orders is a 200 rewrite, which preserves the query string.
    const callbackUrl = resolveCallbackUrl(req);

    // ---- Call Paystack transaction/initialize ----
    const amountKobo = nairaToKobo(Number(order.total));

    const paystackRes = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: amountKobo,
          reference,
          // Explicit return route so the Paystack redirect comes back to a
          // Dropzyy route that can read the reference (never a dashboard
          // default that may drop the query string).
          callback_url: callbackUrl,
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
            user_id: user.id,
          },
        }),
      },
    );

    if (!paystackRes.ok) {
      console.error(
        `paystack-initialize: Paystack API HTTP ${paystackRes.status}`,
      );
      return new Response(JSON.stringify({ error: "Payment provider error" }), {
        status: 502,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const paystackBody = await paystackRes.json();
    if (!paystackBody.status || !paystackBody.data) {
      console.error(
        "paystack-initialize: Paystack initialize failed:",
        paystackBody.message ?? "unknown",
      );
      return new Response(
        JSON.stringify({ error: "Payment initialization failed" }),
        {
          status: 502,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    // ---- Create the pending payment record (B4A) ----
    // Use the same server-generated reference sent to Paystack.
    // The create_pending_payment RPC is idempotent: if an identical
    // pending payment already exists, it returns the existing record.
    const { error: paymentErr } = await supabase.rpc(
      "create_pending_payment",
      {
        p_order_id: order.id,
        p_reference: reference,
        p_amount: Number(order.total),
        p_currency: "NGN",
        p_authorization_url: paystackBody.data.authorization_url,
        p_access_code: paystackBody.data.access_code,
      },
    );

    // ---- Unique-violation race resolution (20261002) ----
    // Two concurrent initializes for the same order both passed the
    // guard above, but the new UNIQUE (order_id) WHERE status =
    // 'pending' index lets only ONE pending payment per order exist.
    // The loser gets a 23505 on insert — resolve by reusing the
    // winner's pending payment instead of failing the checkout.
    if (paymentErr && paymentErr.code === "23505") {
      const { data: raceWinner } = await supabase
        .from("payments")
        .select("reference, authorization_url, access_code, status")
        .eq("order_id", order.id)
        .eq("status", "pending")
        .not("authorization_url", "is", null)
        .maybeSingle();

      if (raceWinner && raceWinner.authorization_url) {
        return new Response(
          JSON.stringify({
            authorization_url: raceWinner.authorization_url,
            access_code: raceWinner.access_code,
            reference: raceWinner.reference,
            reused: true,
          }),
          {
            status: 200,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          },
        );
      }
      console.error(
        "paystack-initialize: pending-payment race lost with no reusable row:",
        paymentErr,
      );
    }

    if (paymentErr) {
      console.error(
        "paystack-initialize: create_pending_payment failed:",
        paymentErr,
      );
      return new Response(
        JSON.stringify({
          error: "Failed to create payment record",
          details: paymentErr.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    // Store authorization_url + access_code for safe retry/reuse
    await supabase
      .from("payments")
      .update({
        authorization_url: paystackBody.data.authorization_url,
        access_code: paystackBody.data.access_code,
      })
      .eq("reference", reference);

    // ---- Return ONLY safe checkout fields to the frontend ----
    return new Response(
      JSON.stringify({
        authorization_url: paystackBody.data.authorization_url,
        access_code: paystackBody.data.access_code,
        reference: paystackBody.data.reference,
      }),
      {
        status: 200,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("paystack-initialize: unexpected error", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
