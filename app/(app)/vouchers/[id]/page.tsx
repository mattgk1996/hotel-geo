import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVoucherOptions } from "@/lib/voucher-options";
import { formatINR } from "@/lib/money";
import { PAYMENT_MODE_LABELS, VOUCHER_TYPE_LABELS, type PaymentMode, type VoucherType } from "@/lib/vouchers";
import { VoucherForm } from "@/components/voucher-form";
import { StatusChip } from "@/components/voucher-list";

type Voucher = {
  id: string;
  voucher_no: string;
  type: VoucherType;
  status: string;
  created_by: string;
  department_id: string;
  voucher_date: string;
  total_amount: string;
  head_id: string | null;
  vendor_name_raw: string | null;
  invoice_number: string | null;
  payment_mode: PaymentMode | null;
  cheque_number: string | null;
  cheque_date: string | null;
  cheque_bank: string | null;
  upi_reference: string | null;
  float_id: string | null;
  staff_note: string | null;
  accounts_note: string | null;
  expense_heads: { name: string } | null;
  departments: { name: string } | null;
  voucher_images: { storage_path: string; page_no: number }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VoucherPage(props: PageProps<"/vouchers/[id]">) {
  const { id } = await props.params;
  const staff = await requireStaff();
  if (!UUID.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("vouchers")
    .select("*, expense_heads(name), departments(name), voucher_images(storage_path, page_no)")
    .eq("id", id)
    .maybeSingle();
  const v = data as unknown as Voucher | null;
  if (!v) notFound();

  const images = [...v.voucher_images].sort((a, b) => a.page_no - b.page_no);
  const { data: signed } = images.length
    ? await supabase.storage.from("voucher-images").createSignedUrls(images.map((i) => i.storage_path), 600)
    : { data: [] };
  const photos = (signed ?? []).map((s) => s.signedUrl).filter((u): u is string => !!u);

  const editable = v.created_by === staff.id && (v.status === "draft" || v.status === "queried");

  return (
    <>
      <div>
        <Link href="/vouchers" className="text-sm text-zinc-500">← My vouchers</Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold">
          {v.voucher_no} <StatusChip status={v.status} />
        </h1>
        <p className="text-sm text-zinc-500">{VOUCHER_TYPE_LABELS[v.type]} · {v.departments?.name}</p>
      </div>

      {v.accounts_note && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <span className="font-semibold">Accounts: </span>{v.accounts_note}
        </p>
      )}

      {editable ? (
        <VoucherForm
          voucherId={v.id}
          queried={v.status === "queried"}
          existingPhotos={photos}
          {...(await loadVoucherOptions(staff))}
          initial={{
            type: v.type,
            departmentId: v.department_id,
            voucherDate: v.voucher_date,
            amount: Number(v.total_amount) ? String(Number(v.total_amount)) : "",
            headId: v.head_id ?? "",
            vendorName: v.vendor_name_raw ?? "",
            invoiceNumber: v.invoice_number ?? "",
            paymentMode: v.payment_mode ?? "",
            chequeNumber: v.cheque_number ?? "",
            chequeDate: v.cheque_date ?? "",
            chequeBank: v.cheque_bank ?? "",
            upiReference: v.upi_reference ?? "",
            floatId: v.float_id ?? "",
            staffNote: v.staff_note ?? "",
          }}
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <Item label="Amount" value={formatINR(v.total_amount)} />
            <Item label="Date" value={v.voucher_date} />
            <Item label="Head" value={v.expense_heads?.name} />
            <Item label="Vendor" value={v.vendor_name_raw} />
            <Item label="Invoice no." value={v.invoice_number} />
            <Item label="Payment" value={v.payment_mode ? PAYMENT_MODE_LABELS[v.payment_mode] : null} />
            {v.payment_mode === "cheque" && (
              <Item label="Cheque" value={[v.cheque_number, v.cheque_bank, v.cheque_date].filter(Boolean).join(" · ")} />
            )}
            {v.payment_mode === "upi" && <Item label="UPI ref." value={v.upi_reference} />}
            {v.staff_note && <Item label="Note" value={v.staff_note} wide />}
          </dl>
          {photos.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {photos.map((src, i) => (
                <a key={src} href={src} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                  <img src={src} alt={`Page ${i + 1}`} className="aspect-[3/4] w-full rounded-xl border border-zinc-200 object-cover dark:border-zinc-800" />
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function Item({ label, value, wide }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  );
}
