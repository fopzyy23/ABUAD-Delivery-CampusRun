#!/usr/bin/env node
// ============================================================
// test_paystack_webhook.js — manual payment-recovery / diagnostic utility
// ============================================================
// PURPOSE:
//   Replays a genuine Paystack `charge.success` webhook POST so the deployed
//   paystack-webhook Edge Function can complete a payment that a customer
//   actually made but which never reached confirmation (e.g. the webhook was
//   never delivered or was rejected transiently).
//
// WHEN TO USE:
//   ONLY when there is evidence of a REAL Paystack payment (e.g. a
//   transaction visible in the Paystack Dashboard) whose order is still
//   stuck in `payment_status = 'pending'`. This is NOT a normal checkout or
//   payment mechanism and must never be used to invent payments.
//
// REQUIREMENTS:
//   * The REAL Paystack transaction ID (from the Paystack Dashboard) must be
//     supplied via PAYSTACK_TXN_ID. It is NEVER invented here.
//   * PAYSTACK_SECRET_KEY is read from the environment ONLY — never
//     hardcoded, never printed, never committed.
//
// SAFETY RULES (by design):
//   * The signature is HMAC-SHA512 over the EXACT raw JSON body sent,
//     exactly like Paystack does it.
//   * This script performs NO direct database writes — all payment state
//     changes happen through the deployed webhook -> RPC path, which is
//     signature-verified, amount-validated, and idempotent.
//   * Output is limited to the HTTP status and a sanitized body.
//
// Required environment variables:
//   PAYSTACK_SECRET_KEY    sk_test_... / sk_live_... (never commit/print)
//   PAYSTACK_TXN_ID        real numeric Paystack transaction id
//   PAYSTACK_REFERENCE     the order payment reference to confirm
//   PAYSTACK_AMOUNT_KOBO   the actual paid amount in kobo (e.g. 100000 = ₦1,000.00)
//   PAYSTACK_CURRENCY      optional, defaults to NGN
//
// Usage (Windows CMD — all values below are EXAMPLE placeholders, not real
// transactions):
//   set PAYSTACK_SECRET_KEY=sk_test_xxx
//   set PAYSTACK_TXN_ID=1234567890
//   set PAYSTACK_REFERENCE=dropzyy_CR-EXAMPLE_0000000000000
//   set PAYSTACK_AMOUNT_KOBO=100000
//   node scripts\test_paystack_webhook.js
// ============================================================
"use strict";

const https = require("https");
const crypto = require("crypto");

const WEBHOOK_URL =
  "https://cmfohldnmytmwjynqfpz.supabase.co/functions/v1/paystack-webhook";

// ---- Payment values come from the environment (no incident-specific data) ----
const REFERENCE = process.env.PAYSTACK_REFERENCE;
const AMOUNT_KOBO = Number(process.env.PAYSTACK_AMOUNT_KOBO);
const CURRENCY = process.env.PAYSTACK_CURRENCY || "NGN";
const EVENT = "charge.success";

// ---- Read credentials from the environment (never hardcoded) ----
const SECRET = process.env.PAYSTACK_SECRET_KEY;
const TXN_ID = process.env.PAYSTACK_TXN_ID;

if (!SECRET) {
  console.error("ERROR: PAYSTACK_SECRET_KEY is not set in the environment.");
  console.error("Set it temporarily in CMD:  set PAYSTACK_SECRET_KEY=sk_test_...");
  process.exit(1);
}
if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(SECRET)) {
  console.error("ERROR: PAYSTACK_SECRET_KEY does not look like a Paystack secret key (expected sk_test_... or sk_live_...). Aborting for safety.");
  process.exit(1);
}
if (!REFERENCE) {
  console.error("ERROR: PAYSTACK_REFERENCE is required and was not provided.");
  console.error("Set it to the order payment reference you are recovering, e.g.:");
  console.error("  set PAYSTACK_REFERENCE=dropzyy_CR-EXAMPLE_0000000000000");
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{6,80}$/.test(REFERENCE)) {
  console.error("ERROR: PAYSTACK_REFERENCE contains unexpected characters (expected the order payment reference format). Aborting for safety.");
  process.exit(1);
}
if (!PAYSTACK_AMOUNT_KOBO_ENV_IS_VALID()) {
  console.error("ERROR: PAYSTACK_AMOUNT_KOBO must be set to the ACTUAL paid amount in kobo (a positive integer, e.g. 100000 = NGN 1,000.00).");
  console.error("It must match the real Paystack transaction — the webhook validates amounts server-side.");
  process.exit(1);
}
if (!TXN_ID) {
  console.error("ERROR: PAYSTACK_TXN_ID is required and was not provided.");
  console.error("The ACTUAL Paystack transaction ID for reference " + REFERENCE);
  console.error("is needed — it will NOT be invented here. Find it in:");
  console.error("  Paystack Dashboard -> Transactions -> reference " + REFERENCE);
  console.error("  (the numeric transaction id, e.g. 1234567890)");
  console.error("Then re-run:  set PAYSTACK_TXN_ID=<actual id>  before running this script.");
  process.exit(1);
}
if (!/^[0-9]{6,20}$/.test(TXN_ID)) {
  console.error("ERROR: PAYSTACK_TXN_ID must be the numeric Paystack transaction id (digits only). Got a non-numeric value; refusing to send an invented ID.");
  process.exit(1);
}

function PAYSTACK_AMOUNT_KOBO_ENV_IS_VALID() {
  return Number.isInteger(AMOUNT_KOBO) && AMOUNT_KOBO > 0;
}

// ---- Build the payload ONCE, then sign the EXACT raw string we send ----
const payload = {
  event: EVENT,
  data: {
    id: Number(TXN_ID),
    domain: SECRET.startsWith("sk_test_") ? "test" : "live",
    status: "success",
    reference: REFERENCE,
    amount: AMOUNT_KOBO,
    currency: CURRENCY,
    transaction_id: Number(TXN_ID),
    channel: "card",
    paid_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
};
const rawBody = JSON.stringify(payload); // signed bytes === sent bytes

const signature = crypto
  .createHmac("sha512", SECRET)
  .update(rawBody, "utf8")
  .digest("hex");

// ---- Sanitizer: the response is never expected to contain secrets, but
//      redact any sk_live_/sk_test_/sb_secret_ token defensively. ----
function sanitize(text) {
  return String(text)
    .replace(/sk_live_[A-Za-z0-9]+/g, "sk_live_[REDACTED]")
    .replace(/sk_test_[A-Za-z0-9]+/g, "sk_test_[REDACTED]")
    .replace(/sb_secret_[A-Za-z0-9]+/g, "sb_secret_[REDACTED]");
}

const url = new URL(WEBHOOK_URL);
const req = https.request(
  {
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(rawBody),
      "x-paystack-signature": signature,
      // NOTE: deliberately NO Supabase auth header — real Paystack servers
      // send none. If the platform JWT gate is still enabled the response
      // will be UNAUTHORIZED_NO_AUTH_HEADER (see hint below).
    },
    timeout: 20000,
  },
  (res) => {
    let body = "";
    res.on("data", (c) => (body += c));
    res.on("end", () => {
      console.log("HTTP status: " + res.statusCode);
      console.log("Response body: " + sanitize(body));
      if (res.statusCode === 401 && /UNAUTHORIZED_NO_AUTH_HEADER/.test(body)) {
        console.log("");
        console.log("HINT: the Supabase platform JWT gate rejected the request");
        console.log("before the function ran. Redeploy the webhook with:");
        console.log("  supabase functions deploy paystack-webhook --no-verify-jwt");
        console.log("(HMAC signature validation stays fully enforced in the function.)");
      }
      if (res.statusCode === 200) {
        console.log("");
        console.log("Webhook accepted. Verify the result (SQL editor, read-only):");
        console.log("  SELECT payment_status, paid_at, transaction_id FROM orders WHERE payment_reference = '" + REFERENCE + "';");
        console.log("  SELECT status, transaction_id, amount FROM payments WHERE reference = '" + REFERENCE + "';");
      }
    });
  }
);

req.on("error", (e) => {
  console.error("Request failed: " + e.message);
  process.exit(1);
});
req.on("timeout", () => {
  console.error("Request timed out after 20s.");
  req.destroy();
  process.exit(1);
});

req.write(rawBody);
req.end();
