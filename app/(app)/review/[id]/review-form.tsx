"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormMessage } from "@/components/pin-input";
import type { FloatOption, HeadOption, VendorOption } from "@/components/voucher-form";
import { formatINR } from "@/lib/money";
import { fieldClass, labelClass } from "@/lib/ui";
import {
  CAPTURE_TYPES, PAYMENT_MODES, PAYMENT_MODE_LABELS, VOUCHER_TYPE_LABELS, headDirectionFor, headRequired, parseAmount, usesFloat,
  type VoucherType,
} from "@/lib/vouchers";
import { reviewVoucher, voidVoucher, type Decision, type ReviewInput } from "../actions";

type Fields = Omit<ReviewInput, "id">;

const FLAG_LABELS: Record<string, string> = {
  amount_mismatch: "Amount mismatch", duplicate_suspect: "Possible duplicate", low_confidence: "Low confidence", old_date: "Old date",
};

export function ReviewForm({
  id, status, nextId, heads, floats, floatBalances, vendors, linked, staffNote, initial, flags,
}: {
  id: string;
  status: string;
  nextId: string | null;
  heads: HeadOption[];
  floats: FloatOption[];
  floatBalances: Record<string, number>;
  vendors: VendorOption[];
  linked: boolean;
  staffNote: string | null;
  initial: Fields;
  flags: string[];
}) {
  const router = useRouter();
  const [f, setF] = useState<Fields>(initial);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const type = f.type as VoucherType;
  const direction = headDirectionFor(type);
  const fitting = heads.filter((h) => h.direction === direction);
  const groups = [...new Set(fitting.map((h) => h.group_name))];
  const amount = parseAmount(f.amount) ?? 0;
  const head = heads.find((h) => h.id === f.headId);
  const reviewable = status === "submitted" || status === "queried";

  // Warnings (never block): float would go negative, Misc over ₹2,000, taxes don't add up.
  const warnings: string[] = flags.map((x) => FLAG_LABELS[x] ?? x);
  if (usesFloat(type) && !linked && f.floatId && f.floatId in floatBalances && status === "submitted") {
    const after = floatBalances[f.floatId] - amount;
    if (after < 0) warnings.push(`Float goes negative after approval (${formatINR(after)}).`);
  }
  if (head?.code === "MISC" && amount > 2000) warnings.push("Miscellaneous over ₹2,000 — is there a better head?");
  const taxParts = [f.taxableValue, f.cgst, f.sgst, f.igst].map((x) => parseAmount(x) ?? 0);
  if (f.taxableValue && Math.abs(taxParts.reduce((a, b) => a + b, 0) - amount) > 1) {
    warnings.push("Taxable value + taxes doesn't match the total (±₹1).");
  }

  function act(decision: Decision) {
    setResult(null);
    start(async () => {
      const r = await reviewVoucher({ ...f, id }, decision);
      setResult(r);
      if (r.ok && decision !== "save") router.push(nextId ? `/review/${nextId}` : "/review");
      else if (r.ok) router.refresh();
    });
  }

  function doVoid() {
    const reason = window.prompt("Reason for voiding this approved voucher?");
    if (!reason) return;
    start(async () => {
      const r = await voidVoucher(id, reason);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  // Desktop shortcut: Ctrl/⌘ + Enter approves.
  useEffect(() => {
    if (status !== "submitted") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.getElementById("approve-btn")?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status]);

  const input = (k: keyof Fields, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <input value={f[k]} onChange={set(k)} disabled={!reviewable} className={fieldClass} {...extra} />
    </label>
  );

  return (
    <section className="flex flex-col gap-4">
      {staffNote && (
        <p className="rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-900"><span className="font-semibold">Staff note: </span>{staffNote}</p>
      )}
      {warnings.length > 0 && (
        <ul className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {warnings.map((w) => <li key={w}>⚠ {w}</li>)}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Type</span>
          <select value={f.type} onChange={set("type")} disabled={!reviewable || linked} className={fieldClass}>
            {[...new Set<VoucherType>([...CAPTURE_TYPES, initial.type as VoucherType])].map((t) => (
              <option key={t} value={t}>{VOUCHER_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        {input("voucherDate", "Date", { type: "date" })}
        {input("amount", "Total amount (₹)", { inputMode: "decimal", className: `${fieldClass} text-lg tabular-nums` })}
        {headRequired(type) && <label className="flex flex-col gap-1">
          <span className={labelClass}>Head</span>
          <select value={f.headId} onChange={set("headId")} disabled={!reviewable} className={fieldClass}>
            <option value="">— Pick —</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {fitting.filter((h) => h.group_name === g).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>}
        {direction === "out" && type !== "suspense_voucher" && (
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Vendor (master)</span>
            <select
              value={f.vendorId}
              disabled={!reviewable}
              onChange={(e) => {
                const v = vendors.find((x) => x.id === e.target.value);
                setF((s) => ({ ...s, vendorId: v?.id ?? "", vendorName: v?.name ?? s.vendorName }));
              }}
              className={fieldClass}
            >
              <option value="">— Not linked —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
        )}
        {input("vendorName", direction === "in" ? "Received from" : type === "suspense_voucher" ? "Paid to" : "Vendor name on bill")}
        {input("vendorGstin", "Vendor GSTIN", { autoCapitalize: "characters", maxLength: 15 })}
        {input("invoiceNumber", "Invoice no.")}
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Payment mode</span>
          <select value={f.paymentMode} onChange={set("paymentMode")} disabled={!reviewable} className={fieldClass}>
            <option value="">—</option>
            {PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</option>)}
          </select>
        </label>
        {f.paymentMode === "upi" && input("upiReference", "UPI reference")}
        {f.paymentMode === "cheque" && (
          <>
            {input("chequeNumber", "Cheque no.")}
            {input("chequeDate", "Cheque date", { type: "date" })}
            {input("chequeBank", "Bank")}
          </>
        )}
        {usesFloat(type) && !linked && floats.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Float</span>
            <select value={f.floatId} onChange={set("floatId")} disabled={!reviewable} className={fieldClass}>
              <option value="">—</option>
              {floats.map((fl) => (
                <option key={fl.id} value={fl.id}>{fl.name} ({formatINR(floatBalances[fl.id])})</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <details className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800" open={!!initial.taxableValue}>
        <summary className="cursor-pointer text-sm font-medium">GST breakup</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {input("taxableValue", "Taxable value", { inputMode: "decimal" })}
          {input("cgst", "CGST", { inputMode: "decimal" })}
          {input("sgst", "SGST", { inputMode: "decimal" })}
          {input("igst", "IGST", { inputMode: "decimal" })}
        </div>
      </details>

      {reviewable && (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Note to staff (needed for Query and Reject)</span>
          <textarea value={f.accountsNote} onChange={set("accountsNote")} rows={2} className={fieldClass} />
        </label>
      )}

      {result && <FormMessage state={result} />}

      {reviewable && (
        <div className="grid grid-cols-2 gap-2">
          {status === "submitted" && (
            <button id="approve-btn" disabled={pending} onClick={() => act("approve")} className="col-span-2 h-12 rounded-xl bg-emerald-700 font-semibold text-white disabled:opacity-50" title="Ctrl/⌘ + Enter">
              {pending ? "Working…" : "Approve"}
            </button>
          )}
          {status === "submitted" && (
            <button disabled={pending} onClick={() => act("query")} className="h-12 rounded-xl border border-amber-400 font-semibold text-amber-900 disabled:opacity-50 dark:text-amber-200">
              Query
            </button>
          )}
          <button disabled={pending} onClick={() => act("reject")} className="h-12 rounded-xl border border-red-300 font-semibold text-red-700 disabled:opacity-50 dark:text-red-300">
            Reject
          </button>
          <button disabled={pending} onClick={() => act("save")} className="col-span-2 h-10 rounded-xl text-sm text-zinc-600 disabled:opacity-50 dark:text-zinc-400">
            Save edits only
          </button>
        </div>
      )}
      {status === "approved" && (
        <button disabled={pending} onClick={doVoid} className="h-10 self-start rounded-xl border border-zinc-300 px-4 text-sm disabled:opacity-50 dark:border-zinc-700">
          Void this voucher
        </button>
      )}
    </section>
  );
}
