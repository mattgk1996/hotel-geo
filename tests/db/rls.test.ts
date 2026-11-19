import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./helpers";

/**
 * Row Level Security tests. Each test acts as a logged-in Supabase user by switching to the
 * `authenticated` role and setting the JWT subject, exactly as PostgREST does.
 */

let db: PGlite;
const users: Record<"admin" | "accounts" | "store" | "front" | "inactive", { authId: string; staffId: string }> =
  {} as never;
let storeVoucherId: string;

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

/** Runs fn as the given user (or as anon), always restoring the superuser afterwards. */
async function as<T>(who: keyof typeof users | "anon", fn: () => Promise<T>): Promise<T> {
  if (who === "anon") {
    await db.exec("set role anon");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  } else {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [users[who].authId]);
    await db.exec("set role authenticated");
  }
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function createUser(key: keyof typeof users, role: string, dept: string, active = true) {
  const [u] = await rows<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [`${key}@staff.hotelgeo.app`],
  );
  const [s] = await rows<{ id: string }>(
    `insert into public.staff (username, full_name, role, department_id, auth_user_id, active)
     values ($1, $1, $2, (select id from public.departments where name = $3), $4, $5)
     on conflict (username) do update set auth_user_id = excluded.auth_user_id
     returning id`,
    [key, role, dept, u.id, active],
  );
  users[key] = { authId: u.id, staffId: s.id };
}

const insertVoucherSql = `
  insert into public.vouchers (type, status, department_id, created_by, total_amount)
  values ('petty_cash_expense', $1, (select id from public.departments where name = $2), $3, 100)
  returning id, status`;

beforeAll(async () => {
  db = await freshDb();
  await createUser("admin", "admin", "Accounts");
  await createUser("accounts", "accounts", "Accounts");
  await createUser("store", "staff", "Store");
  await createUser("front", "staff", "Front Office");
  await createUser("inactive", "staff", "Store", false);

  const [v] = await as("store", () =>
    rows<{ id: string }>(insertVoucherSql, ["draft", "Store", users.store.staffId]),
  );
  storeVoucherId = v.id;
});

afterAll(async () => {
  await db?.close();
});

describe("anon (not logged in)", () => {
  it("sees no rows in any table", async () => {
    await as("anon", async () => {
      for (const t of ["departments", "expense_heads", "staff", "vouchers", "vendors", "audit_log"]) {
        expect(await rows(`select * from public.${t}`), t).toEqual([]);
      }
    });
  });

  it("cannot call the PIN lockout functions", async () => {
    await expect(
      as("anon", () => rows("select * from public.register_failed_pin($1)", [users.store.staffId])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("staff", () => {
  it("reads masters but only their own staff row", async () => {
    await as("store", async () => {
      expect((await rows("select 1 from public.expense_heads")).length).toBe(31);
      expect((await rows("select 1 from public.departments")).length).toBe(3);
      const staff = await rows<{ username: string }>("select username from public.staff");
      expect(staff.map((s) => s.username)).toEqual(["store"]);
    });
  });

  it("cannot change their own role or other masters", async () => {
    await as("store", async () => {
      await db.query("update public.staff set role = 'admin' where username = 'store'");
      await db.query("update public.expense_heads set name = 'x' where code = 'MISC'");
      await expect(
        db.query("insert into public.departments (name) values ('Hacked')"),
      ).rejects.toThrow(/row-level security/);
    });
    const [s] = await rows<{ role: string }>("select role from public.staff where username = 'store'");
    expect(s.role).toBe("staff");
    const [h] = await rows<{ name: string }>("select name from public.expense_heads where code = 'MISC'");
    expect(h.name).toBe("Miscellaneous");
  });

  it("sees only their own vouchers", async () => {
    const [other] = await as("front", () =>
      rows<{ id: string }>(insertVoucherSql, ["draft", "Front Office", users.front.staffId]),
    );
    await as("store", async () => {
      const ids = (await rows<{ id: string }>("select id from public.vouchers")).map((r) => r.id);
      expect(ids).toContain(storeVoucherId);
      expect(ids).not.toContain(other.id);
    });
  });

  it("can only create vouchers for their own department, as themselves", async () => {
    await expect(
      as("store", () => rows(insertVoucherSql, ["draft", "Front Office", users.store.staffId])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as("store", () => rows(insertVoucherSql, ["draft", "Store", users.front.staffId])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as("store", () => rows(insertVoucherSql, ["approved", "Store", users.store.staffId])),
    ).rejects.toThrow(/row-level security/);
  });

  it("can edit and submit a draft, then cannot edit it once submitted", async () => {
    const [v] = await as("store", () =>
      rows<{ id: string }>(insertVoucherSql, ["draft", "Store", users.store.staffId]),
    );
    await as("store", async () => {
      await db.query("update public.vouchers set total_amount = 250, staff_note = 'tea' where id = $1", [v.id]);
      await db.query("update public.vouchers set status = 'submitted' where id = $1", [v.id]);
      // Submitted: the row is no longer updatable by staff, so this silently matches nothing.
      await db.query("update public.vouchers set total_amount = 999 where id = $1", [v.id]);
    });
    const [after] = await rows<{ total_amount: string; status: string }>(
      "select total_amount, status from public.vouchers where id = $1",
      [v.id],
    );
    expect(after).toEqual({ total_amount: "250.00", status: "submitted" });
  });

  it("cannot approve their own voucher or set review fields", async () => {
    const [v] = await as("store", () =>
      rows<{ id: string }>(insertVoucherSql, ["draft", "Store", users.store.staffId]),
    );
    await expect(
      as("store", () => db.query("update public.vouchers set status = 'approved' where id = $1", [v.id])),
    ).rejects.toThrow(/row-level security|cannot move/);
    await expect(
      as("store", () =>
        db.query("update public.vouchers set flags = '{}', accounts_note = 'ok' where id = $1", [v.id]),
      ),
    ).rejects.toThrow(/cannot change/);
  });

  it("can answer a query and resubmit", async () => {
    const [v] = await as("store", () =>
      rows<{ id: string }>(insertVoucherSql, ["submitted", "Store", users.store.staffId]),
    );
    await as("accounts", () =>
      db.query("update public.vouchers set status = 'queried', accounts_note = 'Which shop?' where id = $1", [v.id]),
    );
    await as("store", () =>
      db.query("update public.vouchers set staff_note = 'Ravi Stores', status = 'submitted' where id = $1", [v.id]),
    );
    const [after] = await rows<{ status: string }>("select status from public.vouchers where id = $1", [v.id]);
    expect(after.status).toBe("submitted");
  });

  it("sees the audit history of their own vouchers only", async () => {
    await as("store", async () => {
      const entities = await rows<{ entity_id: string }>("select distinct entity_id from public.audit_log");
      expect(entities.length).toBeGreaterThan(0);
      const own = await rows<{ id: string }>("select id from public.vouchers");
      const ownIds = new Set(own.map((r) => r.id));
      expect(entities.every((e) => ownIds.has(e.entity_id))).toBe(true);
    });
  });

  it("cannot read collections, vendors writes, or AI extractions", async () => {
    await as("store", async () => {
      expect(await rows("select * from public.collections")).toEqual([]);
      expect(await rows("select * from public.ai_extractions")).toEqual([]);
      await expect(db.query("insert into public.vendors (name) values ('X')")).rejects.toThrow(
        /row-level security/,
      );
    });
  });

  it("loses all access when deactivated", async () => {
    await as("inactive", async () => {
      expect(await rows("select * from public.expense_heads")).toEqual([]);
      // Only their own (inactive) row, so the app can say "account deactivated".
      const staff = await rows<{ username: string; active: boolean }>("select username, active from public.staff");
      expect(staff).toEqual([{ username: "inactive", active: false }]);
    });
    await expect(
      as("inactive", () => rows(insertVoucherSql, ["draft", "Store", users.inactive.staffId])),
    ).rejects.toThrow();
  });
});

describe("accounts", () => {
  it("reads every voucher and all staff", async () => {
    await as("accounts", async () => {
      const ids = (await rows<{ id: string }>("select id from public.vouchers")).map((r) => r.id);
      expect(ids).toContain(storeVoucherId);
      expect((await rows("select 1 from public.staff")).length).toBe(5);
    });
  });

  it("can review: approve with a note", async () => {
    await as("accounts", () =>
      db.query(
        "update public.vouchers set status = 'approved', reviewed_by = $2, reviewed_at = now() where id = $1",
        [storeVoucherId, users.accounts.staffId],
      ),
    );
    const [v] = await rows<{ status: string }>("select status from public.vouchers where id = $1", [storeVoucherId]);
    expect(v.status).toBe("approved");
  });

  it("cannot void a voucher", async () => {
    await expect(
      as("accounts", () => db.query("update public.vouchers set status = 'void' where id = $1", [storeVoucherId])),
    ).rejects.toThrow(/only admin can void/);
  });

  it("manages vendors and collections but not masters", async () => {
    await as("accounts", async () => {
      await db.query("insert into public.vendors (name) values ('Ravi Stores')");
      await db.query(
        `insert into public.collections (date, department_id, cash, entered_by)
         values (current_date, (select id from public.departments where name = 'Front Office'), 5000, $1)`,
        [users.accounts.staffId],
      );
      await expect(
        db.query("insert into public.expense_heads (code, name, group_name) values ('X', 'X', 'X')"),
      ).rejects.toThrow(/row-level security/);
      await expect(
        db.query(
          "insert into public.staff (username, full_name) values ('sneaky', 'Sneaky')",
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describe("admin", () => {
  it("writes masters and can void", async () => {
    await as("admin", async () => {
      await db.query("insert into public.departments (name) values ('Housekeeping')");
      await db.query("update public.expense_heads set active = false where code = 'MKT-ADV'");
      await db.query("update public.staff set full_name = 'Store Keeper' where username = 'store'");
      await db.query("update public.vouchers set status = 'void' where id = $1", [storeVoucherId]);
    });
    const [v] = await rows<{ status: string }>("select status from public.vouchers where id = $1", [storeVoucherId]);
    expect(v.status).toBe("void");
  });

  it("has every change recorded in the audit log with the actor", async () => {
    const log = await rows<{ action: string; actor_staff_id: string }>(
      "select action, actor_staff_id from public.audit_log where entity_id = $1 order by at",
      [storeVoucherId],
    );
    expect(log.map((l) => l.action)).toEqual(["create", "status:draft->approved", "status:approved->void"]);
    expect(log.map((l) => l.actor_staff_id)).toEqual([
      users.store.staffId,
      users.accounts.staffId,
      users.admin.staffId,
    ]);
  });
});

describe("voucher photo storage", () => {
  const put = (path: string) =>
    rows("insert into storage.objects (bucket_id, name) values ('voucher-images', $1) returning name", [path]);
  const visible = () => rows<{ name: string }>("select name from storage.objects order by name");

  let draftId: string;

  it("lets staff upload to their own draft, not to others' or submitted vouchers", async () => {
    const [draft] = await as("store", () => rows<{ id: string }>(insertVoucherSql, ["draft", "Store", users.store.staffId]));
    const [submitted] = await as("store", () =>
      rows<{ id: string }>(insertVoucherSql, ["submitted", "Store", users.store.staffId]),
    );
    draftId = draft.id;
    await as("store", () => put(`${draftId}/p1.jpg`));
    await expect(as("store", () => put(`${submitted.id}/p1.jpg`))).rejects.toThrow(/row-level security/);
    await expect(as("front", () => put(`${draftId}/p2.jpg`))).rejects.toThrow(/row-level security/);
    await expect(as("store", () => put("not-a-voucher/p1.jpg"))).rejects.toThrow(/row-level security/);
  });

  it("shows photos only to those who can see the voucher", async () => {
    expect(await as("store", visible)).toEqual([{ name: `${draftId}/p1.jpg` }]);
    expect(await as("front", visible)).toEqual([]);
    expect(await as("accounts", visible)).toEqual([{ name: `${draftId}/p1.jpg` }]);
  });
});

describe("PIN lockout functions (service role)", () => {
  it("locks for 15 minutes on the 5th wrong PIN, then resets", async () => {
    const id = users.front.staffId;
    let last: { attempts: number; locked_until: Date | null } | undefined;
    for (let i = 1; i <= 4; i++) {
      [last] = await rows("select * from public.register_failed_pin($1)", [id]);
      expect(last).toEqual({ attempts: i, locked_until: null });
    }
    [last] = await rows("select * from public.register_failed_pin($1)", [id]);
    expect(last!.attempts).toBe(0);
    const mins = (last!.locked_until!.getTime() - Date.now()) / 60000;
    expect(mins).toBeGreaterThan(14.9);
    expect(mins).toBeLessThanOrEqual(15.01);

    await rows("select public.reset_failed_pins($1)", [id]);
    const [s] = await rows("select failed_pin_attempts, locked_until from public.staff where id = $1", [id]);
    expect(s).toEqual({ failed_pin_attempts: 0, locked_until: null });
  });
});

describe("policy coverage", () => {
  it("every public table except the internal counter has at least one policy", async () => {
    const missing = await rows<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'voucher_counters'
         and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)`);
    expect(missing).toEqual([]);
  });
});
