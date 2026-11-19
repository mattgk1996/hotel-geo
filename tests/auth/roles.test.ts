import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navForRole } from "@/lib/auth/roles";

const hrefs = (role: Parameters<typeof navForRole>[0]) => navForRole(role).map((i) => i.href);

describe("role-based navigation", () => {
  it("gives staff only their own screens", () => {
    expect(hrefs("staff")).toEqual(["/home", "/vouchers/new", "/vouchers"]);
  });

  it("adds review, collections and vendors for accounts", () => {
    expect(hrefs("accounts")).toEqual(["/home", "/vouchers/new", "/vouchers", "/review", "/collections", "/vendors"]);
  });

  it("gives admin everything", () => {
    expect(hrefs("admin")).toEqual(NAV_ITEMS.map((i) => i.href));
  });

  it("has a page for every nav item", () => {
    for (const { href } of NAV_ITEMS) {
      expect(existsSync(join(__dirname, "..", "..", "app", "(app)", href, "page.tsx")), href).toBe(true);
    }
  });
});
