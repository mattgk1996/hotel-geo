import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, readSql } from "./helpers";

let db: PGlite;

beforeAll(async () => {
  db = await freshDb();
});

afterAll(async () => {
  await db?.close();
});

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const res = await db.query<T>(sql, params);
  return res.rows[0];
}

async function makeVoucher(status = "draft") {
  return one<{ id: string; voucher_no: string }>(
    `insert into public.vouchers (type, status, department_id, created_by, total_amount)
     values ('petty_cash_expense', $1,
             (select id from public.departments where name = 'Store'),
             (select id from public.staff where username = 'admin'),
             450)
     returning id, voucher_no`,
    [status],
  );
}

describe("seed data", () => {
  it("creates the three departments", async () => {
    const { rows } = await db.query<{ name: string }>(
      "select name from public.departments order by name",
    );
    expect(rows.map((r) => r.name)).toEqual(["Accounts", "Front Office", "Store"]);
  });

  it("creates 28 spending heads and 3 income heads from spec §6", async () => {
    const out = await one<{ n: number }>(
      "select count(*)::int as n from public.expense_heads where direction = 'out'",
    );
    const inc = await one<{ codes: string[] }>(
      "select array_agg(code order by code) as codes from public.expense_heads where direction = 'in'",
    );
    expect(out.n).toBe(28);
    expect(inc.codes).toEqual(["INC-FB", "INC-OTH", "INC-ROOM"]);
  });

  it("stores keyword hints as an array", async () => {
    const h = await one<{ hints: string[]; group_name: string }>(
      "select hints, group_name from public.expense_heads where code = 'HK-AMEN'",
    );
    expect(h.group_name).toBe("Operating");
    expect(h.hints).toEqual(["soap", "shampoo", "toothbrush", "dental kit", "slippers"]);
  });

  it("creates the admin staff row and links it once the auth user exists", async () => {
    const before = await one<{ auth_user_id: string | null; role: string }>(
      "select auth_user_id, role from public.staff where username = 'admin'",
    );
    expect(before.role).toBe("admin");
    expect(before.auth_user_id).toBeNull();

    const user = await one<{ id: string }>(
      "insert into auth.users (email) values ('admin@staff.hotelgeo.app') returning id",
    );
    await db.exec(readSql("supabase", "seed.sql")); // re-run is safe and links the user

    const after = await one<{ auth_user_id: string }>(
      "select auth_user_id from public.staff where username = 'admin'",
    );
    expect(after.auth_user_id).toBe(user.id);
  });

  it("is idempotent", async () => {
    await db.exec(readSql("supabase", "seed.sql"));
    const c = await one<{ d: number; h: number; s: number }>(
      `select (select count(*) from public.departments)::int as d,
              (select count(*) from public.expense_heads)::int as h,
              (select count(*) from public.staff)::int as s`,
    );
    expect(c).toEqual({ d: 3, h: 31, s: 1 });
  });
});

describe("vouchers", () => {
  it("assigns running voucher numbers HG-YYMM-NNNN in IST", async () => {
    const yymm = await one<{ v: string }>(
      "select to_char(now() at time zone 'Asia/Kolkata', 'YYMM') as v",
    );
    const a = await makeVoucher();
    const b = await makeVoucher();
    expect(a.voucher_no).toMatch(/^HG-\d{4}-\d{4}$/);
    expect(a.voucher_no.slice(3, 7)).toBe(yymm.v);
    expect(Number(b.voucher_no.slice(-4))).toBe(Number(a.voucher_no.slice(-4)) + 1);
  });

  it("defaults reserved Stage B/C columns", async () => {
    const v = await makeVoucher();
    const row = await one<{ tally_status: string; approval_required: boolean; flags: string[] }>(
      "select tally_status, approval_required, flags from public.vouchers where id = $1",
      [v.id],
    );
    expect(row).toEqual({ tally_status: "not_sent", approval_required: false, flags: [] });
  });

  it("writes create, edit and status changes to audit_log with only changed fields", async () => {
    const v = await makeVoucher();
    await db.query("update public.vouchers set total_amount = 750 where id = $1", [v.id]);
    await db.query("update public.vouchers set status = 'submitted' where id = $1", [v.id]);
    await db.query("update public.vouchers set status = 'submitted' where id = $1", [v.id]); // no-op

    const { rows } = await db.query<{ action: string; before: unknown; after: unknown }>(
      "select action, before, after from public.audit_log where entity_id = $1 order by at, action",
      [v.id],
    );
    expect(rows.map((r) => r.action)).toEqual(["create", "update", "status:draft->submitted"]);
    expect(rows[1].before).toEqual({ total_amount: 450 });
    expect(rows[1].after).toEqual({ total_amount: 750 });
    expect(rows[2].after).toEqual({ status: "submitted" });
  });

  it("rejects malformed vendor GSTINs", async () => {
    await expect(
      db.query("insert into public.vendors (name, gstin) values ('Bad', 'not-a-gstin')"),
    ).rejects.toThrow();
    await db.query("insert into public.vendors (name, gstin) values ('Good', '29ABCDE1234F1Z5')");
  });
});

describe("security", () => {
  it("has row level security enabled on every public table", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it("creates a private voucher-images bucket", async () => {
    const b = await one<{ public: boolean }>(
      "select public from storage.buckets where id = 'voucher-images'",
    );
    expect(b.public).toBe(false);
  });

  it("exposes app_health() to anon with counts only", async () => {
    await db.exec("set role anon");
    try {
      const h = await one<{ app_health: Record<string, unknown> }>("select public.app_health()");
      expect(h.app_health).toMatchObject({
        ok: true,
        departments: 3,
        expense_heads: 31,
        admins: 1,
        admins_linked: 1,
      });
      // ...while the tables themselves return nothing to anon (RLS, no policies yet).
      const heads = await db.query("select * from public.expense_heads");
      expect(heads.rows).toEqual([]);
    } finally {
      await db.exec("reset role");
    }
  });
});
