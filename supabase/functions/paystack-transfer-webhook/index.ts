// ============================================================
// Dropzyy - Paystack Transfer Webhook (server-side, B7)
// ============================================================
// Receives Paystack TRANSFER events (transfer.success, transfer.failed,
// transfer.reversed), verifies the x-paystack-signature header with
// HMAC SHA512 over the raw body + PAYSTACK_SECRET_KEY, then applies
// the terminal state machine to the matching transfers ledger row via
// the apply_transfer_webhook_event RPC.
//
// Must be deployed with JWT verification DISABLED because Paystack
// does not send a Supabase JWT:
//   supabase functions deploy paystack-transfer-webhook --no-verify-jwt
// Signature verification (HMAC SHA512) is the authentication.
//
// Required environment variables:
//   PAYSTACK_SECRET_KEY        Paystack secret key
//   SUPABASE_URL               Supabase project URL (built-in)
//   SUPABASE_SERVICE_ROLE_KEY  Supabase service-role key (built-in)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

// Constant-time string comparison to avoid timing attacks.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// HMAC SHA512 hex digest of the raw body using the Paystack secret.
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

// Paystack event -> ledger status. Nothing outside this map is applied.
function transferEventStatus(event: string): string | null {
  switch (event) {
    case "transfer.success":
      return "success";
    case "transfer.failed":
      return "failed";
    case "transfer.reversed":
      return "reversed";
    default:
      return null;
  }
}
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "Webhook body too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
      status: 415,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("paystack-transfer-webhook: missing required environment variable(s).");
    return new Response("Server configuration error", { status: 500 });
  }

  try {
    // ---- Read the RAW body (must NOT be pre-parsed) ----
    const rawBody = await req.text();

    // ---- Signature validation (HMAC SHA512) ----
    const signature = req.headers.get("x-paystack-signature");
    if (!signature) {
      console.warn("paystack-transfer-webhook: missing x-paystack-signature header");
      return new Response("Missing signature", { status: 401 });
    }
    if (!(await isValidSignature(rawBody, signature, PAYSTACK_SECRET_KEY))) {
      console.warn("paystack-transfer-webhook: invalid signature rejected");
      return new Response("Invalid signature", { status: 401 });
    }

    // ---- Parse + validate event structure ----
    let event: { event?: unknown; data?: unknown };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (
      typeof event.event !== "string" ||
      !event.data ||
      typeof event.data !== "object" ||
      Array.isArray(event.data)
    ) {
      return new Response("Invalid event structure", { status: 400 });
    }

    const data = event.data as Record<string, unknown>;
    if (typeof data.reference !== "string") {
      return new Response("Missing reference", { status: 400 });
    }

    // Map the event to a ledger status; unknown transfer events are
    // acknowledged without state change (idempotent safety).
    const newStatus = transferEventStatus(event.event);
    if (newStatus === null) {
      console.log(`paystack-transfer-webhook: ignored event ${event.event}`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ---- Apply via the secure RPC (reference + transfer-code match,
    //      terminal-state protection, idempotent) ----
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: rpcErr } = await supabase.rpc("apply_transfer_webhook_event", {
      p_reference: data.reference,
      p_transfer_code: typeof data.transfer_code === "string" ? data.transfer_code : null,
      p_event_status: newStatus,
      p_payload: event.data as Record<string, unknown>,
    });

    if (rpcErr) {
      console.error("paystack-transfer-webhook: apply failed:", rpcErr.message);
      // 500 makes Paystack retry; the RPC is idempotent so retries are safe.
      return new Response("Apply failed", { status: 500 });
    }

    console.log(
      `paystack-transfer-webhook: applied ${event.event} for ${data.reference} -> ${newStatus}`,
    );
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("paystack-transfer-webhook: unexpected error", err);
    return new Response("Internal server error", { status: 500 });
  }
});
