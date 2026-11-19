import { Suspense } from "react";
import { getAppHealth } from "@/lib/health";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Hotel Geo · Bangalore
        </p>
        <h1 className="mt-1 text-3xl font-semibold">Hello 👋</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Voucher &amp; expense app. Milestone 1: setup check.
        </p>
      </header>

      <Suspense fallback={<StatusCard tone="neutral" title="Checking database…" />}>
        <DatabaseStatus />
      </Suspense>
    </main>
  );
}

async function DatabaseStatus() {
  const health = await getAppHealth();

  if (health.status === "not_configured") {
    return (
      <StatusCard tone="warn" title="Database not configured">
        Set these environment variables: {health.missing.join(", ")}.
      </StatusCard>
    );
  }

  if (health.status === "error") {
    return (
      <StatusCard tone="bad" title="Can't reach the database">
        {health.message}
      </StatusCard>
    );
  }

  const time = new Intl.DateTimeFormat("en-IN", {
    timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(health.dbTime));

  return (
    <StatusCard tone="good" title="Connected to Supabase">
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-zinc-500">Departments</dt>
        <dd className="text-right font-medium tabular-nums">{health.departments}</dd>
        <dt className="text-zinc-500">Expense heads</dt>
        <dd className="text-right font-medium tabular-nums">{health.expenseHeads}</dd>
        <dt className="text-zinc-500">Admin login linked</dt>
        <dd className="text-right font-medium">
          {health.adminsLinked > 0 ? "Yes" : health.admins > 0 ? "Not yet" : "No admin"}
        </dd>
        <dt className="text-zinc-500">Database time (IST)</dt>
        <dd className="text-right font-medium tabular-nums">{time}</dd>
      </dl>
    </StatusCard>
  );
}

const tones = {
  neutral: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900",
  good: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950",
  warn: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950",
  bad: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950",
} as const;

function StatusCard({
  tone,
  title,
  children,
}: {
  tone: keyof typeof tones;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="mt-1 text-sm">{children}</div>}
    </section>
  );
}
