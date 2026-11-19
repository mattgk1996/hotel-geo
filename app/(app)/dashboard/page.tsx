import { ComingSoon } from "@/components/coming-soon";
import { requireRole } from "@/lib/auth/session";

export default async function DashboardPage() {
  await requireRole("admin");
  return (
    <ComingSoon title="Dashboard" milestone={7}>
      Live spending, collections and flags.
    </ComingSoon>
  );
}
