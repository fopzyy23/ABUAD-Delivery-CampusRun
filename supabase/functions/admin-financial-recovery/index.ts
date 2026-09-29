import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, json } from "../_shared/http.ts";

const URL = Deno.env.get("SUPABASE_URL");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed" });
  if (!URL || !SERVICE) return json(req, 500, { error: "Server configuration error" });
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return json(req, 401, { error: "Missing authorization" });
  const jwt = header.slice(7);
  const db = createClient(URL, SERVICE);
  const { data: auth, error: authError } = await db.auth.getUser(jwt);
  if (authError || !auth.user) return json(req, 401, { error: "Invalid authorization" });
  const caller = createClient(URL, SERVICE, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: admin, error: adminError } = await caller.rpc("is_admin");
  if (adminError || !admin) return json(req, 403, { error: "Admin authorization required" });
  const { error: aalError } = await caller.rpc("require_admin_aal2");
  if (aalError) return json(req, 403, { error: aalError.message || "AAL2/MFA is required" });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || body.action !== "retry_cutoff_reimbursement" || typeof body.claim_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.claim_id)) return json(req, 400, { error: "Invalid recovery action" });
  const { data, error } = await db.rpc("retry_automatic_8pm_cutoff_reimbursement", { p_claim_id: body.claim_id });
  if (error) return json(req, 409, { error: error.message || "Recovery could not be started" });
  return json(req, 200, { recovery: data });
});
