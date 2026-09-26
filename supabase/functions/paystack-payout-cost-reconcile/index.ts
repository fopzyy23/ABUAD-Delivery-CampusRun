import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const RECONCILER_SECRET = Deno.env.get("PAYSTACK_RECONCILER_SECRET");
const ENDPOINT = "https://api.paystack.co/balance/ledger";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const OVERLAP_DAYS = 14;

type Counts = { pages_fetched: number; ledger_entries_seen: number; ledger_entries_inserted: number; ledger_entries_existing: number; matched_transfers: number; unmatched_entries: number; fee_amounts_proven: number; errors: string[] };

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const text = (v: unknown): string | null => v === null || v === undefined || v === "" ? null : String(v);
const number = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null;

function nested(obj: any, keys: string[]): unknown {
  let value = obj;
  for (const key of keys) { if (!value || typeof value !== "object") return null; value = value[key]; }
  return value;
}

function transferPaystackId(raw: any): string | null {
  for (const path of [["data", "id"], ["id"], ["data", "transfer", "id"]]) {
    const value = number(nested(raw, path));
    if (value !== null) return String(value);
  }
  return null;
}

function dateWindow(transfers: any[]): string {
  const dates = transfers.map((t) => Date.parse(t.created_at ?? "")).filter(Number.isFinite);
  const latest = dates.length ? Math.max(...dates) : Date.now();
  return new Date(Math.min(latest, Date.now()) - OVERLAP_DAYS * 86400000).toISOString();
}

function authorized(req: Request): boolean {
  if (!RECONCILER_SECRET) return false;
  const apiKey = req.headers.get("apikey");
  const auth = req.headers.get("Authorization");
  return apiKey === RECONCILER_SECRET && (!auth || auth === `Bearer ${RECONCILER_SECRET}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PAYSTACK_SECRET_KEY || !RECONCILER_SECRET) return json(500, { error: "Server configuration error" });
  if (!authorized(req)) return json(401, { error: "Unauthorized" });

  const counts: Counts = { pages_fetched: 0, ledger_entries_seen: 0, ledger_entries_inserted: 0, ledger_entries_existing: 0, matched_transfers: 0, unmatched_entries: 0, fee_amounts_proven: 0, errors: [] };
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: transfers, error: transferError } = await db.from("transfers")
    .select("id,rider_id,withdrawal_request_id,paystack_reference,transfer_code,currency,amount,raw_payload,created_at")
    .eq("payee_type", "rider").not("withdrawal_request_id", "is", null)
    .in("status", ["pending", "processing", "success", "failed", "reversed"]).limit(1000);
  if (transferError) return json(500, { ...counts, error: "Unable to load payout transfers" });

  const transferById = new Map<string, any>();
  for (const t of transfers ?? []) {
    const numeric = transferPaystackId(t.raw_payload);
    if (numeric) transferById.set(`id:${numeric}`, t);
    if (t.paystack_reference) transferById.set(`ref:${t.paystack_reference}`, t);
    if (t.transfer_code) transferById.set(`code:${t.transfer_code}`, t);
  }

  let page = 1;
  let expectedPages: number | null = null;
  const seenPages = new Set<number>();
  try {
    while (page <= MAX_PAGES) {
      if (seenPages.has(page)) throw new Error("Paystack returned a duplicate page");
      seenPages.add(page);
      const url = new URL(ENDPOINT);
      url.searchParams.set("page", String(page)); url.searchParams.set("perPage", String(PAGE_SIZE)); url.searchParams.set("from", dateWindow(transfers ?? []));
      const response = await fetch(url, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json", Accept: "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.status !== true || !Array.isArray(body?.data)) throw new Error(`Paystack ledger request failed (${response.status})`);
      const meta = body.meta;
      const metaPage = number(meta?.page), pageCount = number(meta?.pageCount);
      if (metaPage !== page || pageCount === null || pageCount < 1 || pageCount > MAX_PAGES) throw new Error("Invalid Paystack ledger pagination");
      expectedPages ??= pageCount;
      if (expectedPages !== pageCount) throw new Error("Inconsistent Paystack ledger pagination");
      counts.pages_fetched++; counts.ledger_entries_seen += body.data.length;

      for (const entry of body.data) {
        const ledgerId = text(entry?.id);
        if (!ledgerId) { counts.errors.push("Ledger entry missing id"); continue; }
        const model = text(entry.model_responsible);
        const row = text(entry.model_row);
        const reference = text(entry.reference ?? entry?.data?.reference);
        const code = text(entry.transfer_code ?? entry?.data?.transfer_code);
        const transfer = model?.toLowerCase() === "transfer"
          ? transferById.get(`id:${row}`) ?? (reference ? transferById.get(`ref:${reference}`) : undefined) ?? (code ? transferById.get(`code:${code}`) : undefined)
          : undefined;
        if (transfer) counts.matched_transfers++; else counts.unmatched_entries++;
        const payload = { ...entry };
        const observed = entry.created_at ?? entry.updated_at ?? new Date().toISOString();
        const rowData = { rider_id: transfer?.rider_id ?? null, withdrawal_request_id: transfer?.withdrawal_request_id ?? null, transfer_id: transfer?.id ?? null, attempt_id: null, paystack_ledger_entry_id: ledgerId, paystack_model_responsible: model, paystack_model_row: row, paystack_reference: reference, paystack_transfer_code: code, transfer_amount: transfer ? Number(transfer.amount) : null, balance_difference: number(entry.balance_difference ?? entry.amount), paystack_fee_amount: null, currency: text(entry.currency ?? transfer?.currency) ?? "NGN", fee_status: transfer ? "unknown" : "unmatched", source: "paystack_balance_ledger", source_endpoint: ENDPOINT, raw_payload: payload, observed_at: observed };
        if (transfer) {
          const attempt = await db.from("rider_payout_reconciliation_attempts").select("id").eq("transfer_id", transfer.id).maybeSingle();
          if (attempt.error) throw attempt.error;
          rowData.attempt_id = attempt.data?.id ?? null;
        }
        const result = await db.from("rider_payout_cost_ledger").insert(rowData).select("id").maybeSingle();
        if (result.error) {
          if (result.error.code === "23505") counts.ledger_entries_existing++; else throw result.error;
        } else if (result.data) counts.ledger_entries_inserted++;
      }
      if (page >= pageCount || body.data.length === 0) break;
      page++;
    }
    if (expectedPages !== null && counts.pages_fetched !== expectedPages) throw new Error("Ledger pagination ended before page count");
  } catch (error) {
    counts.errors.push(error instanceof Error ? error.message : "Ledger reconciliation failed");
    return json(502, { ...counts, complete: false });
  }
  return json(200, { ...counts, complete: true });
});
