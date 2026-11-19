/** Pure helpers for the owner dashboard (spec §9). Dates are IST calendar days as YYYY-MM-DD. */

/** Voucher types that count as spend: purchase vouchers (including those settling a suspense
 *  voucher) and legacy petty cash. Suspense vouchers are cash out with bills to follow, shown as
 *  "suspense outstanding" instead, so nothing is counted twice. */
export const SPEND_TYPES = ["petty_cash_expense", "purchase_bill"] as const;

export const RANGES = ["today", "yesterday", "week", "month", "custom"] as const;
export type RangeKey = (typeof RANGES)[number];
export type DateRange = { key: RangeKey; from: string; to: string; label: string };

const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

export function monthStart(day: string): string {
  return `${day.slice(0, 8)}01`;
}

/** Days from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export function resolveRange(today: string, key: string | undefined, from?: string, to?: string): DateRange {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  switch (key) {
    case "yesterday": {
      const y = addDays(today, -1);
      return { key, from: y, to: y, label: "Yesterday" };
    }
    case "week": {
      const dow = (toDate(today).getUTCDay() + 6) % 7; // Monday = 0
      return { key, from: addDays(today, -dow), to: today, label: "This week" };
    }
    case "month":
      return { key, from: monthStart(today), to: today, label: "This month" };
    case "custom":
      if (from && to && iso.test(from) && iso.test(to) && from <= to && daysBetween(from, to).length <= 366) {
        return { key, from, to, label: `${from} → ${to}` };
      }
      break;
  }
  return { key: "today", from: today, to: today, label: "Today" };
}

/** Same days last month for a month-to-date comparison (1st → same day, capped at month end). */
export function sameDaysLastMonth(today: string): { from: string; to: string } {
  const lastMonthEnd = addDays(monthStart(today), -1);
  const from = monthStart(lastMonthEnd);
  const sameDay = `${from.slice(0, 8)}${today.slice(8)}`;
  return { from, to: sameDay < lastMonthEnd ? sameDay : lastMonthEnd };
}

/** Sums `value(row)` by `key(row)`, largest first. */
export function totalsBy<T>(rows: T[], key: (r: T) => string, value: (r: T) => number): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + value(r));
  return [...m.entries()].map(([label, v]) => ({ label, value: Math.round(v * 100) / 100 })).sort((a, b) => b.value - a.value);
}

export function sum<T>(rows: T[], value: (r: T) => number): number {
  return Math.round(rows.reduce((a, r) => a + value(r), 0) * 100) / 100;
}

/** Whole hours since `iso` (for "oldest pending" ages). */
export function hoursSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 3_600_000));
}
