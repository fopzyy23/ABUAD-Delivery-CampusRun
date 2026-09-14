// ============================================================
// Dropzyy - Vendor Delivery Payment Initialization (server-side)
// ============================================================
// Initializes a ₦1,500 delivery payment for Vendor rider deliveries.
// Separate from product payment (which stays pending_vendor/private).
//
// Required environment variables (Supabase Dashboard -> Edge Functions -> Secrets):
//   PAYSTACK_SECRET_KEY        Paystack secret key (starts with sk_live_ or sk_test_)
//   SUPABASE_URL               Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  Supabase service-role key (server-side ONLY)
//   ALLOWED_ORIGIN             Comma-separated CORS origin allowlist
//
// Deploy:  supabase functions deploy paystack-initialize-delivery
// Invoke:  POST {SUPABASE_URL}/functions/v1/paystack-initialize-delivery
// Body:    { "order_id": "<uuid>" }
// Header:  Authorization: Bearer <user-jwt>
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MAX_JSON_BODY_BYTES = 16 * 1024;

// ---- CORS: env-driven origin allowlist (NO wildcard) ----
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

function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

async function rateLimitSubject(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request): Promise<Response> => {
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

  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("paystack-initialize-delivery: missing required environment variable(s).");
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ---- Parse + validate request body ----
    let body: { order_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const orderId = typeof body.order_id === "string" ? body.order_id.trim() : "";

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: "order_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    // ---- Fetch the order SERVER-SIDE ----
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_number, request_type, delivery_method, vendor_delivery_requested, delivery_payment_status, delivery_payment_id, status")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ---- Verify this is a vendor request with rider delivery ----
    if (order.request_type !== "vendor_request") {
      return new Response(
        JSON.stringify({ error: "Delivery payment only for vendor requests" }),
        {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    if (order.delivery_method !== "rider") {
      return new Response(
        JSON.stringify({ error: "Order is not set for rider delivery" }),
        {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    if (order.vendor_delivery_requested !== true) {
      return new Response(
        JSON.stringify({ error: "Vendor has not requested rider delivery" }),
        {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    if (order.delivery_payment_status === "success") {
      return new Response(
        JSON.stringify({ error: "Delivery payment already completed" }),
        {
          status: 409,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    // Delivery payment is vendor-owned. Resolve the vendor relationship from
    // the authenticated JWT's user id and prove that this order contains one
    // of that vendor's products. Never trust vendor_id from the request body.
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("vendor_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("paystack-initialize-delivery: vendor profile lookup failed");
      return new Response(JSON.stringify({ error: "Unable to verify vendor ownership" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    if (!profile?.vendor_id) {
      return new Response(JSON.stringify({ error: "Authenticated user is not an order vendor" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: ownedItem, error: itemErr } = await supabase
      .from("order_items")
      .select("id")
      .eq("order_id", order.id)
      .eq("vendor_id", profile.vendor_id)
      .limit(1)
      .maybeSingle();
    if (itemErr) {
      console.error("paystack-initialize-delivery: vendor order-item lookup failed");
      return new Response(JSON.stringify({ error: "Unable to verify vendor ownership" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    if (!ownedItem) {
      return new Response(JSON.stringify({ error: "Authenticated vendor does not own this order" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Preserve safe retries of an already-created pending payment. New
    // payment creation/initialization attempts must pass all durable buckets.
    let existingPendingPayment = false;
    if (order.delivery_payment_id) {
      const { data: pendingPayment } = await supabase
        .from("payments")
        .select("status")
        .eq("id", order.delivery_payment_id)
        .eq("payment_type", "vendor_delivery")
        .maybeSingle();
      existingPendingPayment = pendingPayment?.status === "pending";
    }

    if (!existingPendingPayment) {
      const action = "paystack_initialize_delivery";
      const ip = req.headers.get("cf-connecting-ip")
        || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || "unknown";
      const subjects = [
        ["user", await rateLimitSubject(user.id)],
        ["ip", await rateLimitSubject(ip)],
        ["resource", await rateLimitSubject(order.id)],
      ] as const;
      let retryAfter = 0;
      for (const [subjectType, subjectHash] of subjects) {
        const { data: limit, error: limitErr } = await supabase.rpc("consume_rate_limit", {
          p_action: action,
          p_subject_type: subjectType,
          p_subject_hash: subjectHash,
        });
        if (limitErr) {
          console.error("paystack-initialize-delivery: rate-limit check failed");
          return new Response(JSON.stringify({ error: "Payment temporarily unavailable" }), {
            status: 503,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          });
        }
        if (!limit?.allowed) retryAfter = Math.max(retryAfter, Number(limit?.retry_after_seconds) || 1);
      }
      if (retryAfter > 0) {
        return new Response(JSON.stringify({ error: "Too many delivery payment attempts" }), {
          status: 429,
          headers: { ...corsHeaders(req), "Content-Type": "application/json", "Retry-After": String(retryAfter) },
        });
      }
    }

    // Create/reuse the authoritative pending payment while forwarding the
    // caller JWT, so auth.uid() in the SECURITY DEFINER RPC is the vendor.
    // Pass the authenticated user's email as p_email (required by RPC).
    const userScoped = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const userEmail = typeof user.email === "string" ? user.email.trim() : "";
    if (!userEmail) {
      return new Response(JSON.stringify({ error: "Authenticated user email is required for delivery payment" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const { data: payment, error: paymentErr } = await userScoped.rpc(
      "create_vendor_delivery_payment",
      { p_order_id: order.id, p_email: userEmail },
    );
    if (paymentErr || !payment) {
      return new Response(JSON.stringify({ error: paymentErr?.message || "Failed to create payment record" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const vendorEmail = userEmail;

    const { data: existingPayment } = await supabase
      .from("payments")
      .select("reference, authorization_url, access_code, status")
      .eq("id", payment.payment_id)
      .single();
    if (existingPayment?.authorization_url) {
      return new Response(JSON.stringify({ ...existingPayment, reused: true }), {
        status: 200,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const reference = payment.reference;
    const amountKobo = 150000;

    const paystackRes = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: vendorEmail,
          amount: amountKobo,
          reference,
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
            vendor_user_id: user.id,
            payment_type: "vendor_delivery",
          },
        }),
      },
    );

    if (!paystackRes.ok) {
      console.error(
        `paystack-initialize-delivery: Paystack API HTTP ${paystackRes.status}`,
      );
      return new Response(JSON.stringify({ error: "Payment provider error" }), {
        status: 502,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const paystackBody = await paystackRes.json();
    if (!paystackBody.status || !paystackBody.data) {
      console.error(
        "paystack-initialize-delivery: Paystack initialize failed:",
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

    // Store authorization_url + access_code for safe retry/reuse
    await supabase
      .from("payments")
      .update({
        authorization_url: paystackBody.data.authorization_url,
        access_code: paystackBody.data.access_code,
      })
      .eq("id", payment.payment_id);

    // ---- Return safe checkout fields ----
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
    console.error("paystack-initialize-delivery: unexpected error", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
