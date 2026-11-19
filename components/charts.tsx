import { formatINR } from "@/lib/money";

const inrShort = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `₹${(n / 1e3).toFixed(1)}k` : `₹${Math.round(n)}`;

/** Horizontal bars for one series (single hue; the title names the measure, so no legend). */
export function BarList({ items, empty = "No data in this range.", max = 12 }: { items: { label: string; value: number; hint?: string }[]; empty?: string; max?: number }) {
  if (!items.length) return <p className="text-sm text-zinc-500">{empty}</p>;
  const shown = items.length > max ? [...items.slice(0, max - 1), { label: "Other", value: items.slice(max - 1).reduce((a, b) => a + b.value, 0) }] : items;
  const top = Math.max(...shown.map((i) => i.value), 1);
  return (
    <ul className="flex flex-col gap-2">
      {shown.map((i) => (
        <li key={i.label} title={`${i.label}: ${formatINR(i.value)}${i.hint ? ` · ${i.hint}` : ""}`} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-sm">
          <span className="truncate text-zinc-600 dark:text-zinc-400">{i.label}</span>
          <span className="h-3">
            <span className="block h-3 rounded-r" style={{ width: `${Math.max(1, (i.value / top) * 100)}%`, background: "var(--series-spend)" }} />
          </span>
          <span className="tabular-nums">{formatINR(i.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** 30-day spend vs collections: two lines on one rupee axis, legend + per-day hover + table view. */
export function TrendChart({ days, spend, collections }: { days: string[]; spend: number[]; collections: number[] }) {
  const W = 600, H = 200, L = 44, R = 8, T = 8, B = 22;
  const top = Math.max(...spend, ...collections, 1);
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(days.length - 1, 1);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const ticks = [0, top / 2, top];
  const band = (W - L - R) / Math.max(days.length - 1, 1);

  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: "var(--series-spend)" }} /> Spend</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: "var(--series-collections)" }} /> Collections</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily spend and collections, last 30 days">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--chart-ink)">{inrShort(t)}</text>
          </g>
        ))}
        {[0, Math.floor((days.length - 1) / 2), days.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} fontSize={10} fill="var(--chart-ink)">
            {days[i]?.slice(5)}
          </text>
        ))}
        <path d={path(collections)} fill="none" stroke="var(--series-collections)" strokeWidth={2} strokeLinejoin="round" />
        <path d={path(spend)} fill="none" stroke="var(--series-spend)" strokeWidth={2} strokeLinejoin="round" />
        {days.map((d, i) => (
          <rect key={d} x={x(i) - band / 2} y={T} width={band} height={H - T - B} fill="transparent" className="hover:fill-zinc-500/10">
            <title>{`${d}\nSpend ${formatINR(spend[i])}\nCollections ${formatINR(collections[i])}`}</title>
          </rect>
        ))}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-zinc-500">Show as table</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead className="text-left text-zinc-500"><tr><th>Date</th><th className="text-right">Spend</th><th className="text-right">Collections</th></tr></thead>
          <tbody>
            {days.map((d, i) => (
              <tr key={d} className="border-t border-zinc-200 dark:border-zinc-800"><td>{d}</td><td className="text-right">{formatINR(spend[i])}</td><td className="text-right">{formatINR(collections[i])}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
