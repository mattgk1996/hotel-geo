/** Voucher vocabulary shared by the capture form, server actions and lists (spec §3). */

export const VOUCHER_TYPES = [
  "petty_cash_expense",
  "purchase_bill",
  "vendor_payment",
  "staff_advance",
  "cash_receipt",
  "sales_voucher",
  "collection",
  "suspense_voucher",
] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

export const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  petty_cash_expense: "Petty cash expense",
  purchase_bill: "Purchase voucher",
  vendor_payment: "Vendor payment",
  staff_advance: "Staff advance",
  cash_receipt: "Cash receipt",
  sales_voucher: "Sales voucher",
  collection: "Collection",
  suspense_voucher: "Suspense voucher",
};

/**
 * Types offered when creating a voucher: Sales, or Expense → Purchase / Suspense.
 * The other types remain only for vouchers created before this change.
 */
export const CAPTURE_TYPES = ["purchase_bill", "suspense_voucher", "sales_voucher"] as const;
export const EXPENSE_TYPES = ["purchase_bill", "suspense_voucher"] as const;

export function isCaptureType(v: unknown): boolean {
  return typeof v === "string" && (CAPTURE_TYPES as readonly string[]).includes(v);
}

export const PAYMENT_MODES = ["cash", "upi", "cheque", "bank_transfer", "card", "vendor_credit"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  cheque: "Cheque",
  bank_transfer: "Bank transfer",
  card: "Card",
  vendor_credit: "Vendor credit",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  queried: "Queried",
  approved: "Approved",
  rejected: "Rejected",
  void: "Void",
};

export const MAX_PAGES = 4;

export function isVoucherType(v: unknown): v is VoucherType {
  return typeof v === "string" && (VOUCHER_TYPES as readonly string[]).includes(v);
}

export function isPaymentMode(v: unknown): v is PaymentMode {
  return typeof v === "string" && (PAYMENT_MODES as readonly string[]).includes(v);
}

/** Money in vs out decides which expense heads fit (spec §3, §6). */
export function headDirectionFor(type: VoucherType): "in" | "out" {
  return type === "cash_receipt" || type === "sales_voucher" || type === "collection" ? "in" : "out";
}

/** Every type needs a photo except suspense vouchers (bills come later) and collections. */
export function photoRequired(type: VoucherType): boolean {
  return type !== "collection" && type !== "suspense_voucher";
}

/** A suspense voucher has no head yet: its purchase vouchers carry the real heads. */
export function headRequired(type: VoucherType): boolean {
  return type !== "suspense_voucher";
}

/** Money-out types that can be paid from a cash float. */
export function usesFloat(type: VoucherType): boolean {
  return type === "purchase_bill" || type === "suspense_voucher" || type === "petty_cash_expense";
}

/** Parses a rupee amount typed by staff ("1,250.5" → 1250.5). Null if not a valid amount. */
export function parseAmount(raw: string): number | null {
  const s = raw.replaceAll(",", "").trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}

export function istToday(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata" }).format(new Date());
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
