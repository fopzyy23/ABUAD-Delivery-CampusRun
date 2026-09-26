// ============================================================
// Dropzyy — Paystack Transfer Recipient Registration (server-side)
// ============================================================
// B6 INFRASTRUCTURE ONLY: registers a Paystack transfer recipient
// (bank account) for the authenticated vendor or rider so that the
// FUTURE payout step has a destination. This function NEVER calls
// Paystack's /transfer endpoint and never moves money.
//
// Required environment variables (Supabase Dashboard → Edge Functions → Secrets):
//   PAYSTACK_SECRET_KEY        Paystack secret key (sk_live_ / sk_test_)
//   SUPABASE_URL               Supabase project URL (built-in)
//   SUPABASE_SERVICE_ROLE_KEY  Supabase service-role key (built-in, server-only)
//   ALLOWED_ORIGIN             Comma-separated origin allowlist (no wildcard)
//
// Deploy: supabase functions deploy paystack-transfer-recipient
// Invoke: POST {SUPABASE_URL}/functions/v1/paystack-transfer-recipient
// Header: Authorization: Bearer <user-jwt>
// Body:   { "payee_type": "vendor" | "rider" | "customer",
//           "account_number": "0123456789",
//           "bank_code": "058",
//           "account_name": "optional display name" }
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MAX_JSON_BODY_BYTES = 16 * 1024;
const ALLOWED_ORIGINS: string[] = (
  Deno.env.get("ALLOWED_ORIGIN") ??
    "https://dropzyyy.netlify.app,http://127.0.0.1:5500"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Paystack's /transferrecipient endpoint ONLY — /transfer is never called here.
const PAYSTACK_TRANSFER_RECIPIENT_URL =
  "https://api.paystack.co/transferrecipient";
const PAYSTACK_BANK_LIST_URL = "https://api.paystack.co/bank?country=nigeria&currency=NGN&perPage=500";

// ---- CORS: strict allowlist echo (no wildcard) ----
// The request Origin is echoed back ONLY when it appears in the
// comma-separated ALLOWED_ORIGIN allowlist. An unknown (or missing)
// Origin gets NO Access-Control-Allow-Origin header at all — never a
// wildcard and never a fallback origin. Mirrors paystack-initialize /
// paystack-refund / paystack-transfer.
function corsFor(origin: string | null): Record<string, string> {
  const o = origin ?? "";
  const allowOrigin = ALLOWED_ORIGINS.includes(o) ? o : "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin;
  return headers;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(origin), "Content-Type": "application/json" },
  });
}

// Trim + cap every string that crosses a trust boundary.
function clean(v: unknown, max = 120): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsFor(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, origin);
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_JSON_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "Request body too large" }), {
      status: 413,
      headers: { ...corsFor(origin), "Content-Type": "application/json" },
    });
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
      status: 415,
      headers: { ...corsFor(origin), "Content-Type": "application/json" },
    });
  }

  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("paystack-transfer-recipient: missing required env var(s).");
    return json({ error: "Server configuration error" }, 500, origin);
  }

  try {
    // ---- Authenticate the caller from the Bearer JWT ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing or invalid Authorization header" }, 401, origin);
    }
    const jwt = authHeader.replace("Bearer ", "");

    // Service-role client lives server-side only; never exposed to the browser.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) {
      return json({ error: "Invalid or expired token" }, 401, origin);
    }

    // ---- Parse + validate the MINIMUM trusted inputs ----
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400, origin);
    }
    const mode = clean(body.mode, 10).toLowerCase();
    if (mode === "banks") {
      const banksRes = await fetch(PAYSTACK_BANK_LIST_URL, { headers: { "Authorization": `Bearer ${PAYSTACK_SECRET_KEY}` } });
      const banks = await banksRes.json().catch(() => ({}));
      if (!banksRes.ok || !banks.status || !Array.isArray(banks.data)) return json({ error: "Bank list unavailable" }, 502, origin);
      return json({ banks: banks.data.filter((b: any) => b.currency === "NGN" && b.active !== false).map((b: any) => ({ name: clean(b.name, 120), code: clean(b.code, 20) })) }, 200, origin);
    }
    const payeeType = clean(body.payee_type, 10).toLowerCase();
    const accountNumber = clean(body.account_number, 20);
    const bankCode = clean(body.bank_code, 10);
    let accountName = clean(body.account_name, 120);

    if (payeeType !== "vendor" && payeeType !== "rider" && payeeType !== "customer") {
      return json({ error: "invalid payee_type" }, 400, origin);
    }
    if (payeeType === "customer" && !/^\d{10}$/.test(accountNumber)) return json({ error: "Nigerian account number must contain exactly 10 digits" }, 400, origin);
    if (payeeType !== "customer" && (!/^\d{6,20}$/.test(accountNumber) || !/^[A-Za-z0-9]{2,10}$/.test(bankCode))) {
      return json({ error: "Invalid account_number or bank_code" }, 400, origin);
    }

    if (payeeType === "customer") {
      const banksRes = await fetch(PAYSTACK_BANK_LIST_URL, { headers: { "Authorization": `Bearer ${PAYSTACK_SECRET_KEY}` } });
      const banks = await banksRes.json().catch(() => ({}));
      const bank = Array.isArray(banks.data) ? banks.data.find((b: any) => String(b.code) === bankCode && b.currency === "NGN" && b.active !== false) : null;
      if (!banksRes.ok || !bank) return json({ error: "Selected bank is not valid for NGN" }, 400, origin);
      const resolveUrl = `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`;
      const resolvedRes = await fetch(resolveUrl, { headers: { "Authorization": `Bearer ${PAYSTACK_SECRET_KEY}` } });
      const resolved = await resolvedRes.json().catch(() => ({}));
      if (!resolvedRes.ok || !resolved.status || !resolved.data?.account_name) return json({ error: "Account could not be resolved" }, 422, origin);
      accountName = clean(resolved.data.account_name, 120);
      if (mode !== "confirm") return json({ resolved: true, account_name: accountName, account_number_last4: accountNumber.slice(-4), bank_name: clean(bank.name, 120), bank_code: bankCode, currency: "NGN" }, 200, origin);
    }

    // ---- Derive the payee identity from the JWT (NEVER from the payload) ----
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id, vendor_id, role")
      .eq("id", user.id)
      .single();
    if (profErr || !profile) {
      return json({ error: "Profile not found" }, 403, origin);
    }

    let vendorId: string | null = null;
    let profileId: string | null = user.id;
    if (payeeType === "vendor") {
      // Multi-role architecture (20260922): vendor capability is the
      // admin-assigned profiles.vendor_id link — profiles.role stays
      // 'user'/'admin' and must NOT be set to 'vendor', so a non-null
      // vendor_id alone authorizes the caller. Mirrors the vendor_id-based
      // RLS predicates used by every other vendor subsystem (orders,
      // products, settlements, transfers).
      if (!profile.vendor_id) {
        return json({ error: "Authenticated user is not a vendor" }, 403, origin);
      }
      vendorId = profile.vendor_id;
    } else if (payeeType === "rider") {
      // Riders are identified by the `riders` table, NOT by profiles.role.
      // profiles.role is never 'rider' (valid roles: 'user' / 'vendor' /
      // 'admin'); the profiles_role_check constraint rejects role='rider', so
      // attempting to set it produces exactly the error being fixed. Verify
      // rider identity via riders.user_id = profiles.id instead — profiles.role
      // stays unchanged. Mirrors the server-side is_approved_rider() helper.
      const { data: riderRow, error: riderErr } = await supabase
        .from("riders")
        .select("id, status")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (riderErr || !riderRow || riderRow.status !== "approved") {
        return json({ error: "Authenticated user is not an approved rider" }, 403, origin);
      }
    }

    // ---- Idempotency pre-check (the RPC enforces this authoritatively) ----
    const recipientSelect = "id, recipient_code, bank_name, account_name";
    const { data: existing } = payeeType === "vendor"
      ? await supabase.from("transfer_recipients").select(recipientSelect)
          .eq("payee_type", "vendor").eq("vendor_id", vendorId).maybeSingle()
      : await supabase.from("transfer_recipients").select(recipientSelect)
          .eq("payee_type", payeeType).eq("profile_id", profileId).eq("recipient_status", "verified").maybeSingle();
    if (existing) {
      // Already registered — a safe no-op (never create a second row).
      return json({
        registered: true,
        already_registered: true,
        bank_name: existing.bank_name,
        account_name: existing.account_name,
      }, 200, origin);
    }

    // ---- Call Paystack /transferrecipient server-side ----
    // The secret key NEVER leaves this function; the browser sees none of it.
    const psRes = await fetch(PAYSTACK_TRANSFER_RECIPIENT_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "nuban",
        name: accountName || `Dropzyy ${payeeType}`,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "NGN",
      }),
    });
    if (!psRes.ok) {
      console.error(
        `paystack-transfer-recipient: Paystack API HTTP ${psRes.status}`,
      );
      return json({ error: "Payment provider error" }, 502, origin);
    }
    const ps = await psRes.json();
    if (!ps.status || !ps.data || !ps.data.recipient_code) {
      console.error(
        "paystack-transfer-recipient: Paystack rejected:",
        ps.message ?? "unknown",
      );
      return json({ error: "Recipient registration failed" }, 502, origin);
    }
    const details = ps.data.details ?? {};

    // ---- Persist via the secure service-role-only RPC ----
    const { data: recipientId, error: rpcErr } = await supabase.rpc(
      "create_transfer_recipient",
      {
        p_payee_type: payeeType,
        p_vendor_id: vendorId,
        p_profile_id: profileId,
        p_recipient_code: ps.data.recipient_code,
        p_paystack_customer_code: clean(ps.data.customer_code, 60) || null,
        p_account_name: clean(details.account_name, 120) || accountName || null,
        p_bank_name: clean(details.bank_name, 120) || null,
        p_bank_code: bankCode || null,
        p_account_number_last4: accountNumber.slice(-4) || null,
        p_currency: "NGN",
      },
    );
    if (rpcErr || !recipientId) {
      console.error(
        "paystack-transfer-recipient: create_transfer_recipient failed:",
        rpcErr,
      );
      return json({ error: "Failed to record recipient" }, 500, origin);
    }

    // ---- Return ONLY safe fields ----
    // recipient_code stays server-side; the client never needs it.
    return json({
      registered: true,
      bank_name: clean(details.bank_name, 120) || null,
      account_name: clean(details.account_name, 120) || accountName || null,
    }, 200, origin);
  } catch (err) {
    console.error("paystack-transfer-recipient: unexpected error", err);
    return json({ error: "Internal server error" }, 500, origin);
  }
});
