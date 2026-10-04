import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const redact = (value: unknown) => String(value ?? "Unexpected server error")
  .replace(/(Bearer\s+|eyJ)[A-Za-z0-9._~+\/-]+/gi, "[REDACTED]")
  .replace(/sk_(?:live|test)_[A-Za-z0-9]+/gi, "[REDACTED]")
  .slice(0, 4000);

const reference = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `ERR-${Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").toUpperCase().slice(0, 8)}`;
};

export async function reportEdgeError(error: unknown, options: {
  action: string;
  source?: "edge_function" | "payment" | "webhook";
  severity?: "warning" | "high" | "critical";
  userId?: string | null;
  orderId?: string | null;
  vendorId?: string | null;
  riderId?: string | null;
  paymentReference?: string | null;
  context?: Record<string, unknown>;
}) {
  const errorReference = reference();
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return errorReference;
    const message = redact(error instanceof Error ? error.message : error);
    const details = redact(error instanceof Error ? error.stack : "");
    const safeContext = Object.fromEntries(Object.entries(options.context || {}).filter(([key]) =>
      !/password|token|authorization|cookie|secret|api[_-]?key|card|cvv|headers/i.test(key)
    ).slice(0, 20).map(([key, value]) => [key, redact(value).slice(0, 500)]));
    await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      .from("error_logs").insert({
        error_reference: errorReference,
        user_id: options.userId || null,
        route: `edge:${options.action}`,
        action: options.action.slice(0, 120),
        category: "financial",
        source: options.source || "edge_function",
        severity: options.severity || "critical",
        sanitized_message: message.slice(0, 1000),
        sanitized_details: details,
        order_id: options.orderId || null,
        vendor_id: options.vendorId || null,
        rider_id: options.riderId || null,
        payment_reference: options.paymentReference ? redact(options.paymentReference).slice(0, 160) : null,
        safe_context: safeContext,
        fingerprint: `${options.source || "edge_function"}|${options.action}|${message}`.slice(0, 1000),
        affected_user_ids: options.userId ? [options.userId] : [],
      });
  } catch (loggingError) {
    console.warn("edge error report could not be stored", redact(loggingError instanceof Error ? loggingError.message : loggingError));
  }
  return errorReference;
}
