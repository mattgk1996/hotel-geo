"use server";

import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/form";
import { isValidGstin } from "@/lib/gstin";
import { cleanText, validateVoucherFields, type VoucherInput } from "@/lib/voucher-fields";
import { headRequired, isVoucherType, parseAmount } from "@/lib/vouchers";

export type ReviewInput = Omit<VoucherInput, "departmentId" | "staffNote" | "suspenseId"> & {
  id: string;
  vendorGstin: string;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  accountsNote: string;
};

export type Decision = "approve" | "save" | "query" | "reject";
export type ReviewResult = { ok: boolean; message: string };

const optMoney = (s: string) => (s.trim() === "" ? null : parseAmount(s));

/**
 * Admin review (approvals are owner-only for now). Saves any edits and applies the decision:
 * approve (submitted → approved), query (submitted → queried, note required),
 * reject (submitted/queried → rejected, reason required), or save edits only.
 */
export async function reviewVoucher(input: ReviewInput, decision: Decision): Promise<ReviewResult> {
  const me = await requireRole("admin");
  const supabase = await createSupabaseServerClient();
  if (!UUID_RE.test(input.id)) return { ok: false, message: "Voucher not found." };

  const { data: v } = await supabase
    .from("vouchers")
    .select("id, type, status, head_id, department_id, suspense_id")
    .eq("id", input.id)
    .maybeSingle();
  if (!v) return { ok: false, message: "Voucher not found." };

  const allowedFrom: Record<Decision, string[]> = {
    approve: ["submitted"],
    query: ["submitted"],
    reject: ["submitted", "queried"],
    save: ["submitted", "queried"],
  };
  if (!allowedFrom[decision].includes(v.status)) {
    return { ok: false, message: `A ${v.status} voucher can't be changed here.` };
  }

  const note = cleanText(input.accountsNote, 1000);
  if (decision === "query" && !note) return { ok: false, message: "Write what you need from the staff member." };
  if (decision === "reject" && !note) return { ok: false, message: "Write the reason for rejecting." };

  if (v.suspense_id && input.type !== "purchase_bill") {
    return { ok: false, message: "A voucher settling a suspense voucher must stay a purchase voucher." };
  }
  const checked = await validateVoucherFields(supabase, input);
  if (!checked.ok) return checked;
  if (decision === "approve" && !(Number(checked.fields.total_amount) > 0)) {
    return { ok: false, message: "Amount must be more than zero to approve." };
  }
  if (decision === "approve" && !checked.fields.head_id && isVoucherType(input.type) && headRequired(input.type)) {
    return { ok: false, message: "Pick a head to approve." };
  }

  const gstin = cleanText(input.vendorGstin, 15)?.toUpperCase() ?? null;
  if (gstin && !isValidGstin(gstin)) return { ok: false, message: "That GSTIN doesn't look right (check the digits)." };
  const tax = {
    taxable_value: optMoney(input.taxableValue),
    cgst: optMoney(input.cgst),
    sgst: optMoney(input.sgst),
    igst: optMoney(input.igst),
  };
  if ([input.taxableValue, input.cgst, input.sgst, input.igst].some((s) => s.trim() && parseAmount(s) === null)) {
    return { ok: false, message: "Tax amounts must be numbers like 450 or 450.50." };
  }

  // Vendor picked from the master list; otherwise link one whose GSTIN or exact name matches.
  let vendorId = (checked.fields.vendor_id as string | null | undefined) ?? null;
  const vendorName = (checked.fields.vendor_name_raw as string | null) ?? "";
  if (!vendorId && (vendorName || gstin)) {
    const { data: vendors } = await supabase.from("vendors").select("id, name, gstin").eq("active", true);
    const match = (vendors ?? []).find(
      (x) => (gstin && x.gstin === gstin) || (vendorName && x.name.toLowerCase() === vendorName.toLowerCase()),
    );
    vendorId = match?.id ?? null;
  }

  const status = { approve: "approved", query: "queried", reject: "rejected", save: v.status }[decision];
  const update = {
    ...checked.fields,
    ...tax,
    vendor_gstin: gstin,
    vendor_id: vendorId,
    accounts_note: note,
    status,
    ...(decision === "save" ? {} : { reviewed_by: me.id, reviewed_at: new Date().toISOString() }),
  };

  const { error } = await supabase.from("vouchers").update(update).eq("id", v.id);
  if (error) return { ok: false, message: `Couldn't save: ${error.message}` };

  // Remember head corrections so vendors learn a default head (3 corrections → default).
  const newHead = checked.fields.head_id as string | null;
  if (v.head_id && newHead && v.head_id !== newHead) {
    await supabase.from("head_corrections").insert({
      voucher_id: v.id, vendor_id: vendorId, from_head_id: v.head_id, to_head_id: newHead, corrected_by: me.id,
    });
  }

  const done = { approve: "Approved.", query: "Sent back with your query.", reject: "Rejected.", save: "Saved." }[decision];
  return { ok: true, message: done };
}

/** Admin only: void an approved voucher (soft). */
export async function voidVoucher(id: string, reason: string): Promise<ReviewResult> {
  const me = await requireRole("admin");
  const supabase = await createSupabaseServerClient();
  const why = cleanText(reason, 1000);
  if (!why) return { ok: false, message: "Write the reason for voiding." };
  if (!UUID_RE.test(id)) return { ok: false, message: "Voucher not found." };

  const { data, error } = await supabase
    .from("vouchers")
    .update({ status: "void", accounts_note: why, reviewed_by: me.id, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "approved")
    .select("id");
  if (error) return { ok: false, message: `Couldn't void: ${error.message}` };
  if (!data?.length) return { ok: false, message: "Only approved vouchers can be voided." };
  return { ok: true, message: "Voided." };
}
