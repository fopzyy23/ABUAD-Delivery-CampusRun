// Trusted order-creation admission gateway.
// The service role is used only server-side to invoke the RPC with the
// caller's original JWT. It is never returned to the browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, handleOptions } from "../_shared/http.ts";

const MAX_BODY_BYTES = 16 * 1024;

async function fingerprint(operation: string, items: unknown[], spot: string, packagingQuantity: number): Promise<string> {
  const normalized = items.map((item) => {
    if (!item || typeof item !== "object") throw new Error("invalid item");
    const value = item as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id.trim() : "";
    const qty = Number(value.qty);
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error("invalid item");
    return { id, qty };
  }).sort((a, b) => a.id.localeCompare(b.id) || a.qty - b.qty);
  const canonical = JSON.stringify({ operation, items: normalized, spot: spot.trim(), packaging_quantity: packagingQuantity });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const logStep = (stage: string, outcome: "success" | "failure", error?: unknown) => {
    const details = error && typeof error === "object"
      ? {
        error_code: typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "rpc_error",
        error_message: typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message.slice(0, 500)
          : "unknown RPC error",
      }
      : {};
    console.log(JSON.stringify({
      event: "order_admission",
      request_id: requestId,
      stage,
      outcome,
      ...details,
    }));
  };
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed" });
  const contentType = req.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return json(req, 415, { error: "Content-Type must be application/json" });
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) return json(req, 413, { error: "Request body too large" });

  const auth = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(auth)) return json(req, 401, { error: "Missing or invalid Authorization header" });
  const jwt = auth.replace(/^Bearer\s+/i, "").trim();
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(req, 500, { error: "Server configuration error" });

  const admin = createClient(url, serviceKey);
  const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !user) return json(req, 401, { error: "Invalid or expired token" });

  let body: { items?: unknown; spot?: unknown; vendor_request?: unknown; idempotency_key?: unknown; packaging_quantity?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: "Invalid JSON body" });
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_BODY_BYTES) return json(req, 413, { error: "Request body too large" });
  if (!Array.isArray(body.items) || typeof body.spot !== "string") return json(req, 400, { error: "items and spot are required" });
  const packagingQuantity = body.vendor_request === true ? 0 : Number(body.packaging_quantity ?? 1);
  if (!Number.isInteger(packagingQuantity) || packagingQuantity < 0 || packagingQuantity > 10) {
    return json(req, 400, { error: "packaging_quantity must be an integer between 0 and 10" });
  }
  const requestKey = typeof body.idempotency_key === "string" ? body.idempotency_key : "";
  if (requestKey.length < 16 || requestKey.length > 256) return json(req, 400, { error: "idempotency_key is required" });

  // The Authorization header is forwarded unchanged. The SQL function uses
  // auth.uid(), never a client-supplied user_id, to bind the admission.
  const operation = body.vendor_request === true
    ? "create_vendor_order_request"
    : "place_order";
  let requestFingerprint: string;
  try {
    requestFingerprint = await fingerprint(operation, body.items, body.spot, packagingQuantity);
  } catch {
    return json(req, 400, { error: "Invalid order request" });
  }
  let attemptId: string | null = null;
  const userClient = createClient(url, serviceKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: existingAttempt, error: existingError } = await admin.rpc("get_order_creation_attempt", {
    p_user_id: user.id, p_operation: operation, p_request_key: requestKey,
    p_request_fingerprint: requestFingerprint,
  });
  if (existingError) {
    logStep("get_order_creation_attempt", "failure", existingError);
    return json(req, 503, { error: "Order admission temporarily unavailable" });
  }
  logStep("get_order_creation_attempt", "success");
  if (existingAttempt?.status === "conflict") return json(req, 409, { error: "idempotency key already used for a different order request" });
  attemptId = existingAttempt?.status === "match" ? existingAttempt.attempt_id : crypto.randomUUID();
  if (existingAttempt?.status !== "match") {
    const { data, error } = await admin.rpc("create_order_admission", {
      p_user_id: user.id, p_operation: operation,
    });
    if (error) {
      logStep("create_order_admission", "failure", error);
      return json(req, 503, { error: "Order admission temporarily unavailable" });
    }
    logStep("create_order_admission", "success");
    if (!data?.allowed) {
      const retry = Math.max(1, Number(data?.retry_after_seconds) || 1);
      return json(req, 429, { error: "Order creation rate limit exceeded", retry_after_seconds: retry });
    }
    if (typeof data.admission_token !== "string") return json(req, 503, { error: "Order admission temporarily unavailable" });
    const { data: consumed, error: consumeError } = await admin.rpc("consume_order_admission", {
      p_user_id: user.id, p_operation: operation, p_admission_token: data.admission_token,
      p_attempt_id: attemptId, p_request_key: requestKey, p_request_fingerprint: requestFingerprint,
    });
    if (consumeError || consumed !== true) {
      logStep("consume_order_admission", "failure", consumeError || { code: "not_consumed" });
      const { data: racedAttempt, error: racedError } = await admin.rpc("get_order_creation_attempt", {
        p_user_id: user.id, p_operation: operation, p_request_key: requestKey,
        p_request_fingerprint: requestFingerprint,
      });
      if (racedError) {
        logStep("race_recheck", "failure", racedError);
        return json(req, 503, { error: "Order admission temporarily unavailable" });
      }
      logStep("race_recheck", "success");
      if (racedAttempt?.status === "conflict") return json(req, 409, { error: "idempotency key already used for a different order request" });
      if (racedAttempt?.status !== "match") return json(req, 503, { error: "Order admission temporarily unavailable" });
      attemptId = racedAttempt.attempt_id;
    } else {
      logStep("consume_order_admission", "success");
    }
  }

  const rpcName = body.vendor_request === true
    ? "create_vendor_order_request"
    : "place_order";
  const { data: order, error: orderError } = await userClient.rpc(rpcName, {
    p_items: body.items,
    p_spot: body.spot,
    p_attempt_id: attemptId,
    p_request_fingerprint: requestFingerprint,
    ...(body.vendor_request === true ? {} : { p_packaging_quantity: packagingQuantity }),
  });
  if (orderError) {
    logStep(rpcName, "failure", orderError);
    return json(req, 400, { error: orderError.message });
  }
  logStep(rpcName, "success");
  return json(req, 200, { order });
  } catch (error) {
    console.error(JSON.stringify({
      event: "order_admission",
      stage: "unexpected_error",
      outcome: "failure",
      error_code: error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "unexpected_error") : "unexpected_error",
      error_message: error instanceof Error ? error.message.slice(0, 500) : "unexpected server error",
    }));
    return json(req, 500, { error: "Order admission temporarily unavailable" });
  }
});
