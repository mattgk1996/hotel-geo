import { ComingSoon } from "@/components/coming-soon";
import { requireRole } from "@/lib/auth/session";

export default async function VendorsPage() {
  await requireRole("accounts", "admin");
  return (
    <ComingSoon title="Vendors" milestone={6}>
      Vendor list, GSTINs and default expense heads.
    </ComingSoon>
  );
}
