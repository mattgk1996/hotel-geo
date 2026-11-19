import { ComingSoon } from "@/components/coming-soon";
import { requireRole } from "@/lib/auth/session";

export default async function DailycollectionsPage() {
  await requireRole("accounts", "admin");
  return (
    <ComingSoon title="Daily collections" milestone={6}>
      Cash, card and UPI collected per department per day.
    </ComingSoon>
  );
}
