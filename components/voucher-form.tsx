"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormMessage } from "@/components/pin-input";
import { compressImage } from "@/lib/compress-image";
import {
  MAX_PAGES,
  PAYMENT_MODES,
  PAYMENT_MODE_LABELS,
  VOUCHER_TYPES,
  VOUCHER_TYPE_LABELS,
  headDirectionFor,
  photoRequired,
  type VoucherType,
} from "@/lib/vouchers";
import { saveVoucher, submitVoucher, uploadVoucherPage, type VoucherInput } from "@/app/(app)/vouchers/actions";

export type HeadOption = { id: string; code: string; name: string; group_name: string; direction: "in" | "out" };
export type FloatOption = { id: string; name: string; department_id: string };
export type DeptOption = { id: string; name: string };
export type Fields = Omit<VoucherInput, "id">;

type NewPage = { key: string; blob: Blob; width: number; height: number; url: string };

const field = "w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 dark:border-zinc-700";
const label = "text-sm text-zinc-500";

export function VoucherForm({
  voucherId,
  initial,
  existingPhotos = [],
  heads,
  floats,
  departments,
  queried = false,
}: {
  voucherId?: string;
  initial: Fields;
  existingPhotos?: string[];
  heads: HeadOption[];
  floats: FloatOption[];
  /** Shown only to accounts/admin, who may file for any department. */
  departments?: DeptOption[];
  queried?: boolean;
}) {
  const router = useRouter();
  const [id, setId] = useState(voucherId);
  const [f, setF] = useState<Fields>(initial);
  const [pages, setPages] = useState<NewPage[]>([]);
  const [uploadedCount, setUploadedCount] = useState(0); // new pages already uploaded (after a partial failure)
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const retakeIndex = useRef<number | null>(null);

  // Free preview URLs when the form goes away.
  const pagesRef = useRef(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  useEffect(() => () => pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const type = f.type as VoucherType;
  const direction = headDirectionFor(type);
  const fittingHeads = heads.filter((h) => h.direction === direction);
  const groups = [...new Set(fittingHeads.map((h) => h.group_name))];
  const deptId = f.departmentId;
  const fittingFloats = floats.filter((fl) => !deptId || fl.department_id === deptId);
  const totalPages = existingPhotos.length + pages.length;
  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  function changeType(next: VoucherType) {
    setF((s) => {
      const keepHead = heads.find((h) => h.id === s.headId)?.direction === headDirectionFor(next);
      return { ...s, type: next, headId: keepHead ? s.headId : "" };
    });
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy("Preparing photo…");
    try {
      const at = retakeIndex.current;
      retakeIndex.current = null;
      const room = MAX_PAGES - totalPages + (at !== null ? 1 : 0);
      const picked = [...files].slice(0, room);
      const made: NewPage[] = [];
      for (const file of picked) {
        const c = await compressImage(file);
        made.push({ ...c, key: crypto.randomUUID(), url: URL.createObjectURL(c.blob) });
      }
      setPages((ps) => {
        if (at === null) return [...ps, ...made];
        URL.revokeObjectURL(ps[at].url);
        return [...ps.slice(0, at), ...made, ...ps.slice(at + 1)];
      });
      if (files.length > picked.length) setError(`Only ${MAX_PAGES} pages per voucher.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that photo.");
    } finally {
      setBusy(null);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  }

  function removePage(i: number) {
    setPages((ps) => {
      URL.revokeObjectURL(ps[i].url);
      return ps.filter((_, j) => j !== i);
    });
  }

  async function save(submit: boolean) {
    setError(null);
    if (submit && photoRequired(type) && totalPages === 0) {
      setError("Take a photo of the voucher first.");
      return;
    }
    try {
      setBusy("Saving…");
      const saved = await saveVoucher({ ...f, id });
      if (!saved.ok) return setError(saved.message);
      setId(saved.id);

      for (let i = uploadedCount; i < pages.length; i++) {
        setBusy(`Uploading photo ${i + 1} of ${pages.length}…`);
        const p = pages[i];
        const fd = new FormData();
        fd.set("voucherId", saved.id);
        fd.set("pageNo", String(existingPhotos.length + i + 1));
        fd.set("file", new File([p.blob], `page-${i + 1}.jpg`, { type: "image/jpeg" }));
        fd.set("width", String(p.width));
        fd.set("height", String(p.height));
        const up = await uploadVoucherPage(fd);
        if (!up.ok) return setError(`${up.message} Your details are saved as a draft — try again.`);
        setUploadedCount(i + 1);
      }

      if (submit) {
        setBusy("Submitting…");
        const sub = await submitVoucher(saved.id);
        if (!sub.ok) return setError(sub.message);
      }
      router.push(`/vouchers/${saved.id}`);
    } catch {
      setError("Network problem. Check your connection and try again — nothing is lost.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Type */}
      <fieldset>
        <legend className={label}>Type</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {VOUCHER_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => changeType(t)}
              className={`rounded-xl border px-3 py-2.5 text-left text-sm ${
                t === type
                  ? "border-emerald-700 bg-emerald-50 font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                  : "border-zinc-300 dark:border-zinc-700"
              } disabled:opacity-50`}
            >
              {VOUCHER_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Photos */}
      <section>
        <p className={label}>
          Photos ({totalPages}/{MAX_PAGES}){!photoRequired(type) && " — optional"}
        </p>
        {totalPages > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {existingPhotos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
              <img key={src} src={src} alt={`Page ${i + 1}`} className="aspect-[3/4] w-full rounded-xl border border-zinc-200 object-cover dark:border-zinc-800" />
            ))}
            {pages.map((p, i) => (
              <div key={p.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                <img src={p.url} alt={`Page ${existingPhotos.length + i + 1}`} className="aspect-[3/4] w-full rounded-xl border border-zinc-200 object-cover dark:border-zinc-800" />
                {i >= uploadedCount && (
                  <div className="absolute inset-x-1 bottom-1 flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        retakeIndex.current = i;
                        cameraRef.current?.click();
                      }}
                      className="flex-1 rounded-lg bg-black/60 py-1 text-xs text-white"
                    >
                      Retake
                    </button>
                    <button type="button" onClick={() => removePage(i)} className="flex-1 rounded-lg bg-black/60 py-1 text-xs text-white">
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {totalPages < MAX_PAGES && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="h-14 rounded-xl bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              📷 {totalPages ? "Add page" : "Take photo"}
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()} className="h-14 rounded-xl border border-zinc-300 dark:border-zinc-700">
              From gallery
            </button>
          </div>
        )}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addFiles(e.target.files)} />
        <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
      </section>

      {/* Details */}
      <section className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={label}>Amount (₹)</span>
          <input inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="0.00" className={`${field} text-lg tabular-nums`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Date</span>
          <input type="date" value={f.voucherDate} onChange={set("voucherDate")} className={field} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={label}>{direction === "in" ? "Income head" : "Expense head"}</span>
          <select value={f.headId} onChange={set("headId")} className={field}>
            <option value="">— Pick a head —</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {fittingHeads.filter((h) => h.group_name === g).map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>{direction === "in" ? "Received from" : "Vendor / paid to"}</span>
          <input value={f.vendorName} onChange={set("vendorName")} className={field} />
        </label>
        {(type === "purchase_bill" || type === "vendor_payment") && (
          <label className="flex flex-col gap-1">
            <span className={label}>Invoice / bill number</span>
            <input value={f.invoiceNumber} onChange={set("invoiceNumber")} className={field} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className={label}>Payment mode</span>
          <select value={f.paymentMode} onChange={set("paymentMode")} className={field}>
            <option value="">—</option>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</option>
            ))}
          </select>
        </label>
        {f.paymentMode === "upi" && (
          <label className="flex flex-col gap-1">
            <span className={label}>UPI reference</span>
            <input value={f.upiReference} onChange={set("upiReference")} className={field} />
          </label>
        )}
        {f.paymentMode === "cheque" && (
          <>
            <label className="flex flex-col gap-1">
              <span className={label}>Cheque number</span>
              <input inputMode="numeric" value={f.chequeNumber} onChange={set("chequeNumber")} className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Cheque date</span>
              <input type="date" value={f.chequeDate} onChange={set("chequeDate")} className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Bank</span>
              <input value={f.chequeBank} onChange={set("chequeBank")} className={field} />
            </label>
          </>
        )}
        {departments && departments.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className={label}>Department</span>
            <select value={f.departmentId} onChange={set("departmentId")} disabled={!!id} className={field}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
        )}
        {type === "petty_cash_expense" && fittingFloats.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className={label}>Paid from float</span>
            <select value={f.floatId} onChange={set("floatId")} className={field}>
              <option value="">—</option>
              {fittingFloats.map((fl) => (
                <option key={fl.id} value={fl.id}>{fl.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={label}>{queried ? "Your reply / note" : "Note (optional)"}</span>
          <textarea value={f.staffNote} onChange={set("staffNote")} rows={2} className={field} />
        </label>
      </section>

      {error && <FormMessage state={{ ok: false, message: error }} />}
      {busy && <p role="status" className="text-sm text-zinc-500">{busy}</p>}

      <div className="grid grid-cols-2 gap-2">
        {!queried && (
          <button type="button" disabled={!!busy} onClick={() => save(false)} className="h-14 rounded-xl border border-zinc-300 font-semibold disabled:opacity-50 dark:border-zinc-700">
            Save draft
          </button>
        )}
        <button
          type="button"
          disabled={!!busy}
          onClick={() => save(true)}
          className={`h-14 rounded-xl bg-emerald-700 font-semibold text-white disabled:opacity-50 ${queried ? "col-span-2" : ""}`}
        >
          {queried ? "Resubmit" : "Submit"}
        </button>
      </div>
    </div>
  );
}
