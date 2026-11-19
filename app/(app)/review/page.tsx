import { ComingSoon } from "@/components/coming-soon";
import { requireRole } from "@/lib/auth/session";

export default async function ReviewqueuePage() {
  await requireRole("accounts", "admin");
  return (
    <ComingSoon title="Review queue" milestone={5}>
      Approve, query or reject submitted vouchers.
    </ComingSoon>
  );
}
