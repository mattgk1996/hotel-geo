import { requireStaff } from "@/lib/auth/session";
import { loadVoucherOptions } from "@/lib/voucher-options";
import { istToday } from "@/lib/vouchers";
import { VoucherForm } from "@/components/voucher-form";

export default async function NewVoucherPage() {
  const staff = await requireStaff();
  const { heads, floats, departments } = await loadVoucherOptions(staff);
  const departmentId = staff.departmentId ?? departments?.[0]?.id ?? "";

  return (
    <>
      <h1 className="text-2xl font-semibold">New voucher</h1>
      {!departmentId ? (
        <p className="text-sm text-red-700">Your account has no department. Ask the admin to set one.</p>
      ) : (
        <VoucherForm
          heads={heads}
          floats={floats}
          departments={departments}
          initial={{
            type: "petty_cash_expense",
            departmentId,
            voucherDate: istToday(),
            amount: "",
            headId: "",
            vendorName: "",
            invoiceNumber: "",
            paymentMode: "cash",
            chequeNumber: "",
            chequeDate: "",
            chequeBank: "",
            upiReference: "",
            floatId: floats.filter((f) => f.department_id === departmentId).length === 1
              ? floats.find((f) => f.department_id === departmentId)!.id
              : "",
            staffNote: "",
          }}
        />
      )}
    </>
  );
}
