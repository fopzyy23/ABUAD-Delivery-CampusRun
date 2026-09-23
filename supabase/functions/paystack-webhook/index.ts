// ============================================================
// Dropzyy - Paystack Webhook Receiver (server-side)
// ============================================================
// Handles BOTH product payments (restaurant/vendor products) AND
// vendor delivery payments (₦1,500 rider delivery fee).
//
// Required environment variables (Supabase Dashboard -> Edge Functions -> Secrets):
//   PAYSTACK_SECRET_KEY        Paystack secret key (starts with sk_live_ or sk_test_)
//   SUPABASE_URL               Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  Supabase service-role key (server-side ONLY)
//
// Deploy: supabase functions deploy paystack-webhook
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-paystack-signature, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Constant-time string comparison to avoid timing attacks.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Validate the Paystack webhook signature (HMAC SHA512 of raw body).
async function isValidSignature(
  rawBody: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
  return safeEqual(hex, signature);
}

// Map a Paystack event to a payment status.
function paystackEventToStatus(event: string): "success" | "failed" | null {
  if (event === "charge.success") return "success";
  if (
    event === "charge.failed" || event === "abandoned" ||
    event === "failed_transaction"
  ) {
    return "failed";
  }
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "Webhook body too large" }), {
      status: 413,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
      status: 415,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("paystack-webhook: missing required environment variable(s).");
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const valid = await isValidSignature(rawBody, signature, PAYSTACK_SECRET_KEY);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody);
    const event: string = payload.event;
    const data = payload.data;
    const reference: string = data?.reference;
    const status = paystackEventToStatus(event);

    if (!reference || !status) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Look up the payment by reference (handles both product and delivery payments)
    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .select("id, order_id, status, payment_type")
      .eq("reference", reference)
      .single();

    if (payErr || !payment) {
      console.warn(`paystack-webhook: payment not found for ref ${reference}`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: if already success, safe no-op
    if (payment.status === "success") {
      return new Response(JSON.stringify({ received: true, note: "already success (no-op)" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the order for amount/currency verification
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, total, payment_status, delivery_payment_status, request_type, delivery_method")
      .eq("id", payment.order_id)
      .single();

    if (orderErr || !order) {
      console.error(`paystack-webhook: order ${payment.order_id} not found`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify amount (Paystack sends kobo) and currency
    const paystackAmountKobo = data?.amount;
    const paystackFeeKobo =
      typeof data?.fees === "number" && Number.isFinite(data.fees)
        ? data.fees
        : null;
    const paystackChannel = typeof data?.channel === "string" ? data.channel : null;
    const paystackPaidAt = typeof data?.paid_at === "string" ? data.paid_at : null;
    const currency = data?.currency;

    // Determine expected amount based on payment type
    let expectedKobo: number;
    if (payment.payment_type === "vendor_delivery") {
      expectedKobo = 150000; // ₦1,500 = 150000 kobo
    } else {
      expectedKobo = Math.round(Number(order.total) * 100);
    }

    if (status === "success") {
      // Verify amount and currency
      if (paystackAmountKobo !== expectedKobo) {
        console.error(
          `paystack-webhook: amount mismatch for ${reference}: ` +
            `expected ${expectedKobo} kobo, got ${paystackAmountKobo} (type: ${payment.payment_type})`,
        );
        return new Response(JSON.stringify({ received: true, note: "amount mismatch" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (currency !== "NGN") {
        console.error(`paystack-webhook: currency mismatch for ${reference}: ${currency}`);
        return new Response(JSON.stringify({ received: true, note: "currency mismatch" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const txnId = String(data?.id ?? data?.transaction_id ?? "");

      if (payment.payment_type === "vendor_delivery") {
        // ---- VENDOR DELIVERY PAYMENT SUCCESS ----
        // Verify this is a vendor delivery order
        if (order.request_type !== "vendor_request") {
          console.error(`paystack-webhook: delivery payment for non-vendor-request order ${order.id}`);
          return new Response(JSON.stringify({ received: true, note: "invalid order type" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (order.delivery_method !== "rider") {
          console.error(`paystack-webhook: delivery payment for non-rider order ${order.id}`);
          return new Response(JSON.stringify({ received: true, note: "invalid delivery method" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error: rpcErr } = await supabase.rpc(
          "handle_vendor_delivery_payment_success",
          {
            p_reference: reference,
            p_transaction_id: String(data?.id ?? data?.transaction_id ?? ""),
            p_order_id: payment.order_id,
            p_paystack_amount: paystackAmountKobo,
            p_paystack_fee: paystackFeeKobo,
            p_paystack_channel: paystackChannel,
            p_paystack_paid_at: paystackPaidAt,
          },
        );
        if (rpcErr) {
          console.error("paystack-webhook: delivery payment success RPC failed:", rpcErr);
          return new Response(JSON.stringify({ error: "payment settlement failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        // ---- PRODUCT PAYMENT SUCCESS (restaurant or vendor products) ----
        // Verify amount matches order total
        if (paystackAmountKobo !== Math.round(Number(order.total) * 100)) {
          console.error(
            `paystack-webhook: amount mismatch for ${reference}: ` +
              `expected ${Math.round(Number(order.total) * 100)} kobo, got ${paystackAmountKobo}`,
          );
          return new Response(JSON.stringify({ received: true, note: "amount mismatch" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (currency !== "NGN") {
          console.error(`paystack-webhook: currency mismatch for ${reference}: ${currency}`);
          return new Response(JSON.stringify({ received: true, note: "currency mismatch" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const txnId = String(data?.id ?? data?.transaction_id ?? "");
        const { error: rpcErr } = await supabase.rpc(
          "handle_paystack_payment_success",
          {
            p_reference: reference,
            p_transaction_id: txnId,
            p_order_id: payment.order_id,
            p_paystack_amount: paystackAmountKobo,
            p_paystack_fee: paystackFeeKobo,
            p_paystack_channel: paystackChannel,
            p_paystack_paid_at: paystackPaidAt,
          },
        );
        if (rpcErr) {
          console.error("paystack-webhook: success RPC failed:", rpcErr);
          return new Response(JSON.stringify({ error: "payment settlement failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } else {
      // failed event
      if (payment.payment_type === "vendor_delivery") {
        const { error: rpcErr } = await supabase.rpc(
          "handle_vendor_delivery_payment_failed",
          {
            p_reference: reference,
            p_order_id: payment.order_id,
          },
        );
        if (rpcErr) {
          console.error("paystack-webhook: delivery payment failed RPC failed:", rpcErr);
          return new Response(JSON.stringify({ error: "payment record update failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        const { error: rpcErr } = await supabase.rpc(
          "handle_paystack_payment_failed",
          {
            p_reference: reference,
            p_order_id: payment.order_id,
          },
        );
        if (rpcErr) {
          console.error("paystack-webhook: failed RPC failed:", rpcErr);
          return new Response(JSON.stringify({ error: "payment record update failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("paystack-webhook: unexpected error", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
