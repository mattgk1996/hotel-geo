import { ComingSoon } from "@/components/coming-soon";
import { requireStaff } from "@/lib/auth/session";

export default async function MyvouchersPage() {
  await requireStaff();
  return (
    <ComingSoon title="My vouchers" milestone={3}>
      Your vouchers with their status and any queries from Accounts.
    </ComingSoon>
  );
}
