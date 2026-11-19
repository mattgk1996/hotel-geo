export function ComingSoon({ title, milestone, children }: { title: string; milestone: number; children?: React.ReactNode }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 p-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        <p className="font-medium">Coming in milestone {milestone}.</p>
        {children && <div className="mt-1 text-sm">{children}</div>}
      </div>
    </section>
  );
}
