import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/form";
import { suspenseSummary } from "@/lib/suspense";
import { loadVoucherOptions } from "@/lib/voucher-options";
import { istToday } from "@/lib/vouchers";
import { VoucherForm, type SuspenseContext } from "@/components/voucher-form";

export default async function NewVoucherPage(props: PageProps<"/vouchers/new">) {
  const staff = await requireStaff();
  const sp = await props.searchParams;
  const suspenseParam = typeof sp.suspense === "string" && UUID_RE.test(sp.suspense) ? sp.suspense : null;

  const { heads, floats, departments, vendors } = await loadVoucherOptions(staff);

  // "Add purchase voucher" from a suspense voucher: the new purchase settles it.
  let suspense: SuspenseContext | undefined;
  let suspenseDept: string | null = null;
  if (suspenseParam) {
    const supabase = await createSupabaseServerClient();
    const s = await suspenseSummary(supabase, suspenseParam);
    const canSettle = s && ["submitted", "approved"].includes(s.status) && (s.createdBy === staff.id || staff.role === "admin");
    if (!s || !canSettle) {
      return (
        <>
          <h1 className="text-2xl font-semibold">New voucher</h1>
          <p className="text-sm text-red-700">That suspense voucher can&apos;t be settled. <Link href="/vouchers/new" className="underline">Start a normal voucher</Link>.</p>
        </>
      );
    }
    suspense = { id: s.id, voucherNo: s.voucherNo, amount: s.amount, settled: s.settled + s.inProgress };
    const { data } = await supabase.from("vouchers").select("department_id").eq("id", s.id).single();
    suspenseDept = data?.department_id ?? null;
  }

  const departmentId = suspenseDept ?? staff.departmentId ?? departments?.[0]?.id ?? "";
  const deptFloats = floats.filter((f) => f.department_id === departmentId);

  return (
    <>
      <h1 className="text-2xl font-semibold">{suspense ? "Purchase voucher" : "New voucher"}</h1>
      {!departmentId ? (
        <p className="text-sm text-red-700">Your account has no department. Ask the admin to set one.</p>
      ) : (
        <VoucherForm
          heads={heads}
          floats={floats}
          departments={departments}
          vendors={vendors}
          suspense={suspense}
          initial={{
            type: "purchase_bill",
            departmentId,
            voucherDate: istToday(),
            amount: suspense ? String(Math.max(0, suspense.amount - suspense.settled) || "") : "",
            headId: "",
            vendorName: "",
            vendorId: "",
            suspenseId: suspense?.id,
            invoiceNumber: "",
            paymentMode: "cash",
            chequeNumber: "",
            chequeDate: "",
            chequeBank: "",
            upiReference: "",
            floatId: !suspense && deptFloats.length === 1 ? deptFloats[0].id : "",
            staffNote: "",
          }}
        />
      )}
    </>
  );
}
