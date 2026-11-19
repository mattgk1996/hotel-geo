export const ROLES = ["staff", "accounts", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  staff: "Staff",
  accounts: "Accounts",
  admin: "Admin",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export type NavItem = { href: string; label: string; roles: readonly Role[] };

const everyone = ROLES;
const reviewers = ["accounts", "admin"] as const;
const owner = ["admin"] as const;

/** Role-based navigation (spec §8). Order is the order shown in the app. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/home", label: "Home", roles: everyone },
  { href: "/vouchers/new", label: "New voucher", roles: everyone },
  { href: "/vouchers", label: "My vouchers", roles: everyone },
  // Approvals go to the owner only for now; accounts may get them back with role management.
  { href: "/review", label: "Review", roles: owner },
  { href: "/collections", label: "Collections", roles: reviewers },
  { href: "/vendors", label: "Vendors", roles: reviewers },
  { href: "/dashboard", label: "Dashboard", roles: owner },
  { href: "/admin", label: "Masters", roles: owner },
];

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
