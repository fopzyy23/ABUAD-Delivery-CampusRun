// Trusted order-creation admission gateway.
// The service role is used only server-side to invoke the RPC with the
// caller's original JWT. It is never returned to the browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 16 * 1024;
const ALLOWED_ORIGINS: string[] = (
  Deno.env.get("ALLOWED_ORIGIN") ??
    "https://dropzyy.com,https://www.dropzyy.com,http://127.0.0.1:5500"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsHeaders = (req: Request): HeadersInit => {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  const headers: HeadersInit = {
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-max-age": "600",
    "vary": "Origin",
  };
  if (allowOrigin) headers["access-control-allow-origin"] = allowOrigin;
  return headers;
};
const json = (req: Request, body: Record<string, unknown>, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(req), ...headers },
  });

async function fingerprint(operation: string, items: unknown[], spot: string): Promise<string> {
  const normalized = items.map((item) => {
    if (!item || typeof item !== "object") throw new Error("invalid item");
    const value = item as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id.trim() : "";
    const qty = Number(value.qty);
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error("invalid item");
    return { id, qty };
  }).sort((a, b) => a.id.localeCompare(b.id) || a.qty - b.qty);
  const canonical = JSON.stringify({ operation, items: normalized, spot: spot.trim() });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const logStep = (stage: string, outcome: "success" | "failure", error?: unknown) => {
    const details = error && typeof error === "object"
      ? { error_code: typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "rpc_error" }
      : {};
    console.log(JSON.stringify({
      event: "order_admission",
      request_id: requestId,
      stage,
      outcome,
      ...details,
    }));
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const contentType = req.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return json(req, { error: "Content-Type must be application/json" }, 415);
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) return json(req, { error: "Request body too large" }, 413);

  const auth = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(auth)) return json(req, { error: "Missing or invalid Authorization header" }, 401);
  const jwt = auth.replace(/^Bearer\s+/i, "").trim();
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(req, { error: "Server configuration error" }, 500);

  const admin = createClient(url, serviceKey);
  const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !user) return json(req, { error: "Invalid or expired token" }, 401);

  let body: { items?: unknown; spot?: unknown; vendor_request?: unknown; idempotency_key?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_BODY_BYTES) return json(req, { error: "Request body too large" }, 413);
  if (!Array.isArray(body.items) || typeof body.spot !== "string") return json(req, { error: "items and spot are required" }, 400);
  const requestKey = typeof body.idempotency_key === "string" ? body.idempotency_key : "";
  if (requestKey.length < 16 || requestKey.length > 256) return json(req, { error: "idempotency_key is required" }, 400);

  // The Authorization header is forwarded unchanged. The SQL function uses
  // auth.uid(), never a client-supplied user_id, to bind the admission.
  const operation = body.vendor_request === true
    ? "create_vendor_order_request"
    : "place_order";
  let requestFingerprint: string;
  try {
    requestFingerprint = await fingerprint(operation, body.items, body.spot);
  } catch {
    return json(req, { error: "Invalid order request" }, 400);
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
    return json(req, { error: "Order admission temporarily unavailable" }, 503);
  }
  logStep("get_order_creation_attempt", "success");
  if (existingAttempt?.status === "conflict") return json(req, { error: "idempotency key already used for a different order request" }, 409);
  attemptId = existingAttempt?.status === "match" ? existingAttempt.attempt_id : crypto.randomUUID();
  if (existingAttempt?.status !== "match") {
    const { data, error } = await admin.rpc("create_order_admission", {
      p_user_id: user.id, p_operation: operation,
    });
    if (error) {
      logStep("create_order_admission", "failure", error);
      return json(req, { error: "Order admission temporarily unavailable" }, 503);
    }
    logStep("create_order_admission", "success");
    if (!data?.allowed) {
      const retry = Math.max(1, Number(data?.retry_after_seconds) || 1);
      return json(req, { error: "Order creation rate limit exceeded" }, 429, { "retry-after": String(retry) });
    }
    if (typeof data.admission_token !== "string") return json(req, { error: "Order admission temporarily unavailable" }, 503);
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
        return json(req, { error: "Order admission temporarily unavailable" }, 503);
      }
      logStep("race_recheck", "success");
      if (racedAttempt?.status === "conflict") return json(req, { error: "idempotency key already used for a different order request" }, 409);
      if (racedAttempt?.status !== "match") return json(req, { error: "Order admission temporarily unavailable" }, 503);
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
  });
  if (orderError) {
    logStep(rpcName, "failure", orderError);
    return json(req, { error: orderError.message }, 400);
  }
  logStep(rpcName, "success");
  return json(req, { order });
});
