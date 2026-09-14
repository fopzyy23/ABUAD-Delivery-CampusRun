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
// Body:    { "order_id": "<uuid>", "email": "user@example.com" }
// Header:  Authorization: Bearer <user-jwt>
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
    const email = typeof body.email === "string" ? body.email.trim() : "";

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
      .select("id, order_number, user_id, request_type, delivery_method, vendor_delivery_requested, delivery_payment_status, spot")
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

    // ---- Check for existing pending delivery payment (idempotency) ----
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("reference, authorization_url, access_code, status")
      .eq("order_id", orderId)
      .eq("payment_type", "vendor_delivery")
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

    // ---- Generate unique Paystack reference ----
    const reference = `dropzyy_delivery_${order.order_number}_${Date.now()}`;

    // ---- Call Paystack transaction/initialize ----
    // Fixed ₦1,500 delivery fee = 150000 kobo
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
          email,
          amount: amountKobo,
          reference,
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
            user_id: user.id,
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

    // ---- Create the pending delivery payment record via RPC ----
    const { error: paymentErr } = await supabase.rpc(
      "create_vendor_delivery_payment",
      {
        p_order_id: order.id,
        p_email: email,
      },
    );

    // ---- Race resolution (UNIQUE index on order_id + payment_type where pending) ----
    if (paymentErr && paymentErr.code === "23505") {
      const { data: raceWinner } = await supabase
        .from("payments")
        .select("reference, authorization_url, access_code, status")
        .eq("order_id", order.id)
        .eq("payment_type", "vendor_delivery")
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
        "paystack-initialize-delivery: pending-payment race lost with no reusable row:",
        paymentErr,
      );
    }

    if (paymentErr) {
      console.error(
        "paystack-initialize-delivery: create_vendor_delivery_payment failed:",
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