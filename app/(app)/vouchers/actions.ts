"use server";

import { createHash } from "node:crypto";
import { requireStaff, type CurrentStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_PAGES, headRequired, isCaptureType, isVoucherType, photoRequired } from "@/lib/vouchers";
import { cleanText, validateVoucherFields, type VoucherInput } from "@/lib/voucher-fields";

export type { VoucherInput };

export type ActionResult = { ok: true; id: string } | { ok: false; message: string };

const BUCKET = "voucher-images";
const MAX_UPLOAD_BYTES = 1_500_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** The caller's own voucher, if it is still editable from the capture screen (draft or queried). */
async function editableVoucher(supabase: Supabase, staff: CurrentStaff, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await supabase
    .from("vouchers")
    .select("id, type, status, created_by, department_id, suspense_id")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.created_by !== staff.id || !["draft", "queried"].includes(data.status)) return null;
  return data as { id: string; type: string; status: string; created_by: string; department_id: string; suspense_id: string | null };
}

/** Creates the voucher as a draft, or updates the caller's draft/queried voucher. Never changes status. */
export async function saveVoucher(input: VoucherInput): Promise<ActionResult> {
  const staff = await requireStaff();
  const supabase = await createSupabaseServerClient();

  if (input.id) {
    const existing = await editableVoucher(supabase, staff, input.id);
    if (!existing) return { ok: false, message: "This voucher can no longer be edited." };
    if (input.type !== existing.type && !isCaptureType(input.type)) return { ok: false, message: "Pick a voucher type." };
    if (existing.suspense_id && input.type !== "purchase_bill") {
      return { ok: false, message: "A voucher settling a suspense voucher must stay a purchase voucher." };
    }
    const checked = await validateVoucherFields(supabase, input);
    if (!checked.ok) return checked;
    const { error } = await supabase
      .from("vouchers")
      .update({ ...checked.fields, staff_note: cleanText(input.staffNote, 1000) })
      .eq("id", existing.id);
    if (error) return { ok: false, message: `Couldn't save: ${error.message}` };
    return { ok: true, id: existing.id };
  }

  if (!isCaptureType(input.type)) return { ok: false, message: "Pick a voucher type." };

  // Settling a suspense voucher: the purchase goes to the suspense voucher's department.
  let suspense: { id: string; department_id: string } | null = null;
  if (input.suspenseId) {
    if (input.type !== "purchase_bill") return { ok: false, message: "A suspense voucher is settled with purchase vouchers." };
    suspense = await settleableSuspense(supabase, staff, input.suspenseId);
    if (!suspense) return { ok: false, message: "That suspense voucher can't be settled (it must be submitted or approved)." };
  }

  // Staff always file under their own department; accounts/admin may pick one.
  const departmentId = suspense?.department_id
    ?? (staff.role === "staff" ? staff.departmentId : input.departmentId || staff.departmentId);
  if (!departmentId) return { ok: false, message: "Your account has no department. Ask the admin to set one." };

  const checked = await validateVoucherFields(supabase, input);
  if (!checked.ok) return checked;

  const { data, error } = await supabase
    .from("vouchers")
    .insert({
      ...checked.fields,
      staff_note: cleanText(input.staffNote, 1000),
      ...(suspense ? { suspense_id: suspense.id } : {}),
      status: "draft",
      department_id: departmentId,
      created_by: staff.id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: `Couldn't save: ${error?.message ?? "unknown error"}` };
  return { ok: true, id: data.id };
}

/** A suspense voucher the caller may settle: their own (or any, for admin), submitted or approved. */
async function settleableSuspense(supabase: Supabase, staff: CurrentStaff, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await supabase
    .from("vouchers")
    .select("id, type, status, created_by, department_id")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.type !== "suspense_voucher" || !["submitted", "approved"].includes(data.status)) return null;
  if (data.created_by !== staff.id && staff.role !== "admin") return null;
  return { id: data.id as string, department_id: data.department_id as string };
}

/** Uploads one compressed photo (FormData: voucherId, pageNo, file, width, height). */
export async function uploadVoucherPage(formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();
  const supabase = await createSupabaseServerClient();

  const voucherId = String(formData.get("voucherId") ?? "");
  const pageNo = Number(formData.get("pageNo"));
  const file = formData.get("file");
  const width = Number(formData.get("width")) || null;
  const height = Number(formData.get("height")) || null;

  if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > MAX_PAGES) return { ok: false, message: "Too many pages." };
  if (!(file instanceof File) || file.type !== "image/jpeg") return { ok: false, message: "Photo must be a JPEG." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: "Photo is too large." };

  const voucher = await editableVoucher(supabase, staff, voucherId);
  if (!voucher) return { ok: false, message: "This voucher can no longer be edited." };

  const { data: taken } = await supabase
    .from("voucher_images")
    .select("id")
    .eq("voucher_id", voucher.id)
    .eq("page_no", pageNo)
    .maybeSingle();
  if (taken) return { ok: true, id: voucher.id }; // already uploaded (retry after a dropped response)

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = `${voucher.id}/p${pageNo}-${sha256.slice(0, 12)}.jpg`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  // "already exists" = an earlier attempt stored the file but didn't record it; carry on.
  if (upErr && !/exists|duplicate/i.test(upErr.message)) {
    return { ok: false, message: `Upload failed: ${upErr.message}` };
  }

  const { error } = await supabase
    .from("voucher_images")
    .insert({ voucher_id: voucher.id, storage_path: path, sha256, width, height, page_no: pageNo });
  if (error) return { ok: false, message: `Couldn't record the photo: ${error.message}` };
  return { ok: true, id: voucher.id };
}

/** Sends a draft (or answered query) to Accounts after checking it is complete. */
export async function submitVoucher(id: string): Promise<ActionResult> {
  const staff = await requireStaff();
  const supabase = await createSupabaseServerClient();

  const voucher = await editableVoucher(supabase, staff, id);
  if (!voucher) return { ok: false, message: "This voucher can no longer be submitted." };

  const { data: v } = await supabase
    .from("vouchers")
    .select("type, total_amount, head_id, voucher_images(count)")
    .eq("id", voucher.id)
    .single();
  if (!v) return { ok: false, message: "Voucher not found." };

  const pages = (v.voucher_images as unknown as { count: number }[])[0]?.count ?? 0;
  if (isVoucherType(v.type) && photoRequired(v.type) && pages === 0) {
    return { ok: false, message: "Add at least one photo before submitting." };
  }
  if (!(Number(v.total_amount) > 0)) return { ok: false, message: "Enter the amount before submitting." };
  if (!v.head_id && isVoucherType(v.type) && headRequired(v.type)) {
    return { ok: false, message: "Pick an expense head before submitting." };
  }

  const { error } = await supabase.from("vouchers").update({ status: "submitted" }).eq("id", voucher.id);
  if (error) return { ok: false, message: `Couldn't submit: ${error.message}` };
  return { ok: true, id: voucher.id };
}
