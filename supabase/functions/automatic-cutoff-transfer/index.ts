import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { executeAuthoritativeTransfer } from "../_shared/execute-transfer.ts";
import { reportEdgeError } from "../_shared/error-reporting.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const WORKER_SECRET = Deno.env.get("AUTOMATIC_CUTOFF_WORKER_SECRET");
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PAYSTACK_SECRET_KEY || !WORKER_SECRET) return json(500, { error: "Server configuration error" });

  const apiKey = req.headers.get("apikey");
  const authorization = req.headers.get("Authorization");
  if (apiKey !== WORKER_SECRET || (authorization && authorization !== `Bearer ${WORKER_SECRET}`)) {
    return json(401, { error: "Unauthorized" });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON body" }); }
  const allowed = new Set(["transfer_id"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return json(400, { error: "Only transfer_id is accepted" });
  const transferId = body.transfer_id;
  if (typeof transferId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transferId)) {
    return json(400, { error: "transfer_id (uuid) is required" });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  try {
    const result = await executeAuthoritativeTransfer(supabase, transferId, PAYSTACK_SECRET_KEY, (message, details) => {
      console.error(`automatic-cutoff-transfer: ${message}`, details ?? "");
    });
    if (result.kind === "accepted") return json(200, result);
    if (result.kind === "processing") return json(409, result);
    if (result.kind === "completed") return json(200, result);
    if (result.kind === "error") return json(result.stage === "paystack" ? 502 : 500, { error: result.message });
    return json(409, result);
  } catch (error) {
    console.error("automatic-cutoff-transfer: unexpected error", error instanceof Error ? error.message : "unknown");
    const error_reference = await reportEdgeError(error, { action: "automatic_cutoff_transfer", source: "payment", context: { transfer_id: transferId } });
    return json(500, { success: false, error: "Internal server error", error_reference });
  }
});
