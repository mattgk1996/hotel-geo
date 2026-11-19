import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { isIsoDate, istToday, PAYMENT_MODE_LABELS, STATUS_LABELS, VOUCHER_TYPE_LABELS, type PaymentMode, type VoucherType } from "@/lib/vouchers";

/** GET /api/export?from=YYYY-MM-DD&to=YYYY-MM-DD → raw data as an Excel workbook (admin). */

type VRow = {
  voucher_no: string; voucher_date: string; type: VoucherType; status: string; vendor_name_raw: string | null;
  vendor_gstin: string | null; invoice_number: string | null; payment_mode: PaymentMode | null; cheque_number: string | null;
  cheque_date: string | null; cheque_bank: string | null; upi_reference: string | null; taxable_value: string | null;
  cgst: string | null; sgst: string | null; igst: string | null; total_amount: string; flags: string[];
  staff_note: string | null; accounts_note: string | null; reviewed_at: string | null; created_at: string;
  departments: { name: string } | null; creator: { full_name: string } | null; reviewer: { full_name: string } | null;
  vendors: { name: string } | null; expense_heads: { code: string; name: string } | null; 
  suspense: { voucher_no: string } | null; voucher_images: { count: number }[];
};
type CRow = { date: string; cash: string; card: string; upi: string; other: string; note: string | null; created_at: string; departments: { name: string } | null; enterer: { full_name: string } | null };

const MONEY = "#,##,##0.00";
const num = (x: string | null | undefined) => (x === null || x === undefined ? null : Number(x));
const day = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);
const ist = new Intl.DateTimeFormat("en-CA", {
  timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});
const stamp = (iso: string | null) => (iso ? ist.format(new Date(iso)).replace(",", "") : null);

function sheet(wb: ExcelJS.Workbook, name: string, cols: { header: string; key: string; width?: number; money?: boolean; date?: boolean }[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({
    header: c.header, key: c.key, width: c.width ?? 14,
    style: c.money ? { numFmt: MONEY } : c.date ? { numFmt: "dd-mm-yyyy" } : {},
  }));
  ws.getRow(1).font = { bold: true };
  ws.addRows(rows);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}

export async function GET(request: Request) {
  await requireRole("admin");
  const url = new URL(request.url);
  const today = istToday();
  const from = isIsoDate(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : today;
  const to = isIsoDate(url.searchParams.get("to") ?? "") ? url.searchParams.get("to")! : today;
  if (from > to) return new Response("'from' must be on or before 'to'", { status: 400 });

  const supabase = await createSupabaseServerClient();
  const [vouchers, collections] = await Promise.all([
    fetchAll<VRow>((a, b) => supabase.from("vouchers")
      .select(`voucher_no, voucher_date, type, status, vendor_name_raw, vendor_gstin, invoice_number, payment_mode,
        cheque_number, cheque_date, cheque_bank, upi_reference, taxable_value, cgst, sgst, igst, total_amount, flags,
        staff_note, accounts_note, reviewed_at, created_at, departments(name),
        creator:staff!vouchers_created_by_fkey(full_name), reviewer:staff!vouchers_reviewed_by_fkey(full_name),
        vendors(name), expense_heads(code, name),
        suspense:vouchers!vouchers_suspense_id_fkey(voucher_no), voucher_images(count)`)
      .gte("voucher_date", from).lte("voucher_date", to).order("voucher_date").order("voucher_no").range(a, b)
      .overrideTypes<VRow[], { merge: false }>()),
    fetchAll<CRow>((a, b) => supabase.from("collections")
      .select("date, cash, card, upi, other, note, created_at, departments(name), enterer:staff!collections_entered_by_fkey(full_name)")
      .gte("date", from).lte("date", to).order("date").order("id").range(a, b).overrideTypes<CRow[], { merge: false }>()),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  sheet(wb, "Vouchers", [
    { header: "Voucher no", key: "no", width: 14 }, { header: "Date", key: "date", date: true, width: 12 },
    { header: "Type", key: "type", width: 18 }, { header: "Status", key: "status", width: 11 },
    { header: "Department", key: "dept" }, { header: "Created by", key: "creator", width: 16 },
    { header: "Vendor (master)", key: "vendor", width: 22 }, { header: "Vendor / party name", key: "vendorRaw", width: 22 },
    { header: "Vendor GSTIN", key: "gstin", width: 17 }, { header: "Invoice no", key: "invoice" },
    { header: "Head code", key: "headCode", width: 10 }, { header: "Head", key: "head", width: 24 },
    { header: "Payment mode", key: "mode" }, { header: "Cheque no", key: "chequeNo" },
    { header: "Cheque date", key: "chequeDate", date: true, width: 12 }, { header: "Bank", key: "bank" },
    { header: "UPI ref", key: "upi" }, { header: "Taxable value", key: "taxable", money: true },
    { header: "CGST", key: "cgst", money: true }, { header: "SGST", key: "sgst", money: true }, { header: "IGST", key: "igst", money: true },
    { header: "Total", key: "total", money: true },
    { header: "Settles suspense", key: "suspense", width: 16 }, { header: "Flags", key: "flags", width: 18 },
    { header: "Photos", key: "photos", width: 8 }, { header: "Staff note", key: "staffNote", width: 30 },
    { header: "Accounts note", key: "accountsNote", width: 30 }, { header: "Reviewed by", key: "reviewer", width: 16 },
    { header: "Reviewed at (IST)", key: "reviewedAt", width: 17 }, { header: "Created at (IST)", key: "createdAt", width: 17 },
  ], vouchers.map((v) => ({
    no: v.voucher_no, date: day(v.voucher_date), type: VOUCHER_TYPE_LABELS[v.type] ?? v.type, status: STATUS_LABELS[v.status] ?? v.status,
    dept: v.departments?.name, creator: v.creator?.full_name, vendor: v.vendors?.name, vendorRaw: v.vendor_name_raw,
    gstin: v.vendor_gstin, invoice: v.invoice_number, headCode: v.expense_heads?.code, head: v.expense_heads?.name,
    mode: v.payment_mode ? PAYMENT_MODE_LABELS[v.payment_mode] : null, chequeNo: v.cheque_number, chequeDate: day(v.cheque_date),
    bank: v.cheque_bank, upi: v.upi_reference, taxable: num(v.taxable_value), cgst: num(v.cgst), sgst: num(v.sgst), igst: num(v.igst),
    total: num(v.total_amount), suspense: v.suspense?.voucher_no, flags: v.flags.join(", "),
    photos: v.voucher_images[0]?.count ?? 0, staffNote: v.staff_note, accountsNote: v.accounts_note,
    reviewer: v.reviewer?.full_name, reviewedAt: stamp(v.reviewed_at), createdAt: stamp(v.created_at),
  })));

  sheet(wb, "Collections", [
    { header: "Date", key: "date", date: true, width: 12 }, { header: "Department", key: "dept", width: 16 },
    { header: "Cash", key: "cash", money: true }, { header: "Card", key: "card", money: true },
    { header: "UPI", key: "upi", money: true }, { header: "Other", key: "other", money: true },
    { header: "Total", key: "total", money: true }, { header: "Note", key: "note", width: 30 },
    { header: "Entered by", key: "by", width: 16 }, { header: "Entered at (IST)", key: "at", width: 17 },
  ], collections.map((c) => ({
    date: day(c.date), dept: c.departments?.name, cash: num(c.cash), card: num(c.card), upi: num(c.upi), other: num(c.other),
    total: Number(c.cash) + Number(c.card) + Number(c.upi) + Number(c.other), note: c.note, by: c.enterer?.full_name, at: stamp(c.created_at),
  })));

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="hotel-geo-${from}-to-${to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
