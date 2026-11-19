import { ComingSoon } from "@/components/coming-soon";
import { requireStaff } from "@/lib/auth/session";

export default async function NewvoucherPage() {
  await requireStaff();
  return (
    <ComingSoon title="New voucher" milestone={3}>
      Take photos of a voucher and submit it.
    </ComingSoon>
  );
}
