import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/form";
import { formatINR } from "@/lib/money";
import { signedPhotoUrls } from "@/lib/voucher-photos";
import { loadVoucherOptions } from "@/lib/voucher-options";
import { VOUCHER_TYPE_LABELS, type VoucherType } from "@/lib/vouchers";
import { StatusChip } from "@/components/voucher-list";
import { VoucherHistory } from "@/components/voucher-history";
import { SettlesLink, SuspensePanel } from "@/components/suspense-panel";
import { ReviewForm } from "./review-form";

type V = {
  id: string; voucher_no: string; type: VoucherType; status: string; department_id: string; voucher_date: string;
  total_amount: string; head_id: string | null; vendor_name_raw: string | null; vendor_gstin: string | null;
  invoice_number: string | null; payment_mode: string | null; cheque_number: string | null; cheque_date: string | null;
  cheque_bank: string | null; upi_reference: string | null; float_id: string | null;
  vendor_id: string | null; suspense_id: string | null; staff_note: string | null;
  accounts_note: string | null; taxable_value: string | null; cgst: string | null; sgst: string | null; igst: string | null;
  flags: string[]; created_at: string;
  departments: { name: string } | null; creator: { full_name: string } | null;
  voucher_images: { storage_path: string; page_no: number }[];
};

const s = (x: string | null) => (x === null ? "" : String(Number(x)));

export default async function ReviewVoucherPage(props: PageProps<"/review/[id]">) {
  const staff = await requireRole("admin");
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("vouchers")
    .select("*, departments(name), creator:staff!vouchers_created_by_fkey(full_name), voucher_images(storage_path, page_no)")
    .eq("id", id)
    .maybeSingle();
  const v = data as unknown as V | null;
  if (!v) notFound();

  const [photos, options, { data: next }] = await Promise.all([
    signedPhotoUrls(supabase, v.voucher_images),
    loadVoucherOptions(staff),
    supabase.from("vouchers").select("id").eq("status", "submitted").neq("id", v.id)
      .order("created_at", { ascending: true }).limit(1),
  ]);
  const floats = options.floats.filter((f) => f.department_id === v.department_id);
  const { data: floatRows } = await supabase.from("cash_floats").select("id, current_balance").in("id", floats.map((f) => f.id));
  const balances = Object.fromEntries((floatRows ?? []).map((f) => [f.id, Number(f.current_balance)]));

  return (
    <>
      <div>
        <Link href="/review" className="text-sm text-zinc-500">← Review queue</Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold">
          {v.voucher_no} <StatusChip status={v.status} />
        </h1>
        <p className="text-sm text-zinc-500">
          {VOUCHER_TYPE_LABELS[v.type]} · {v.departments?.name} · by {v.creator?.full_name} · {formatINR(v.total_amount)}
        </p>
      </div>

      {v.suspense_id && <SettlesLink suspenseId={v.suspense_id} admin />}
      {v.type === "suspense_voucher" && <SuspensePanel voucherId={v.id} staff={staff} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-2">
          {photos.length === 0 && <p className="text-sm text-zinc-500">No photos.</p>}
          {photos.map((src, i) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" title="Open full size (zoom)">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
              <img src={src} alt={`Page ${i + 1}`} className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800" />
            </a>
          ))}
        </section>

        <ReviewForm
          id={v.id}
          status={v.status}
          nextId={next?.[0]?.id ?? null}
          heads={options.heads}
          floats={floats}
          floatBalances={balances}
          vendors={options.vendors}
          linked={!!v.suspense_id}
          staffNote={v.staff_note}
          initial={{
            type: v.type, voucherDate: v.voucher_date, amount: s(v.total_amount), headId: v.head_id ?? "",
            vendorName: v.vendor_name_raw ?? "", vendorId: v.vendor_id ?? "", vendorGstin: v.vendor_gstin ?? "", invoiceNumber: v.invoice_number ?? "",
            paymentMode: v.payment_mode ?? "", chequeNumber: v.cheque_number ?? "", chequeDate: v.cheque_date ?? "",
            chequeBank: v.cheque_bank ?? "", upiReference: v.upi_reference ?? "", floatId: v.float_id ?? "",
            taxableValue: s(v.taxable_value), cgst: s(v.cgst), sgst: s(v.sgst), igst: s(v.igst),
            accountsNote: v.accounts_note ?? "",
          }}
          flags={v.flags}
        />
      </div>

      <VoucherHistory voucherId={v.id} />
    </>
  );
}
