import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/form";
import { headDirectionFor, isIsoDate, isPaymentMode, isVoucherType, parseAmount, usesFloat } from "@/lib/vouchers";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Fields staff fill in on the capture form. */
export type VoucherInput = {
  id?: string;
  type: string;
  departmentId?: string;
  voucherDate: string;
  amount: string;
  headId: string;
  vendorName: string;
  /** Vendor from the master list ("" = not in list; vendorName is used instead). */
  vendorId: string;
  /** Set when this purchase voucher settles (part of) a suspense voucher. */
  suspenseId?: string;
  invoiceNumber: string;
  paymentMode: string;
  chequeNumber: string;
  chequeDate: string;
  chequeBank: string;
  upiReference: string;
  floatId: string;
  staffNote: string;
};

const NIL = "00000000-0000-0000-0000-000000000000";

export const cleanText = (s: string | undefined, max = 200) => {
  const t = (s ?? "").trim().slice(0, max);
  return t || null;
};

/**
 * Validates the shared voucher fields and returns the matching `vouchers` columns.
 * `departmentId` is the department the voucher belongs to (used to check the cash float).
 */
export async function validateVoucherFields(
  supabase: Supabase,
  input: Omit<VoucherInput, "id" | "departmentId" | "staffNote" | "suspenseId" | "vendorId"> & { vendorId?: string },
  departmentId: string,
  opts: { settlesSuspense?: boolean } = {},
): Promise<{ ok: true; fields: Record<string, unknown> } | { ok: false; message: string }> {
  if (!isVoucherType(input.type)) return { ok: false, message: "Pick a voucher type." };
  if (!isIsoDate(input.voucherDate)) return { ok: false, message: "Enter a valid date." };
  const amount = input.amount.trim() === "" ? 0 : parseAmount(input.amount);
  if (amount === null) return { ok: false, message: "Amount must be a number like 1250 or 1250.50." };
  const paymentMode = input.paymentMode || null;
  if (paymentMode !== null && !isPaymentMode(paymentMode)) return { ok: false, message: "Pick a payment mode." };
  if (input.chequeDate && !isIsoDate(input.chequeDate)) return { ok: false, message: "Enter a valid cheque date." };

  let headId: string | null = null;
  if (input.headId) {
    const { data: head } = await supabase
      .from("expense_heads")
      .select("id, direction, active")
      .eq("id", UUID_RE.test(input.headId) ? input.headId : NIL)
      .maybeSingle();
    if (!head || !head.active) return { ok: false, message: "That expense head is not available." };
    if (head.direction !== headDirectionFor(input.type)) {
      return { ok: false, message: "That head doesn't fit this voucher type." };
    }
    headId = head.id;
  }

  let floatId: string | null = null;
  if (usesFloat(input.type) && input.floatId && !opts.settlesSuspense) {
    const { data: float } = await supabase
      .from("cash_floats")
      .select("id, department_id, active")
      .eq("id", UUID_RE.test(input.floatId) ? input.floatId : NIL)
      .maybeSingle();
    if (!float || !float.active || float.department_id !== departmentId) {
      return { ok: false, message: "That cash float is not available for this department." };
    }
    floatId = float.id;
  }

  // Vendor from the master list (expense vouchers). Its name is copied for display/search.
  let vendorId: string | null = null;
  let vendorName = cleanText(input.vendorName);
  if (input.vendorId && headDirectionFor(input.type) === "out") {
    const { data: vendor } = await supabase
      .from("vendors")
      .select("id, name, active")
      .eq("id", UUID_RE.test(input.vendorId) ? input.vendorId : NIL)
      .maybeSingle();
    if (!vendor || !vendor.active) return { ok: false, message: "That vendor is not available." };
    vendorId = vendor.id;
    vendorName = vendor.name;
  }

  const cheque = paymentMode === "cheque";
  return {
    ok: true,
    fields: {
      type: input.type,
      voucher_date: input.voucherDate,
      total_amount: amount,
      head_id: headId,
      vendor_name_raw: vendorName,
      ...(input.vendorId !== undefined ? { vendor_id: vendorId } : {}),
      invoice_number: cleanText(input.invoiceNumber, 60),
      payment_mode: paymentMode,
      cheque_number: cheque ? cleanText(input.chequeNumber, 30) : null,
      cheque_date: cheque && input.chequeDate ? input.chequeDate : null,
      cheque_bank: cheque ? cleanText(input.chequeBank, 80) : null,
      upi_reference: paymentMode === "upi" ? cleanText(input.upiReference, 60) : null,
      float_id: floatId,
    },
  };
}
