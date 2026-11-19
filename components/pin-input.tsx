export function PinInput({ name, label, autoComplete = "off" }: { name: string; label: string; autoComplete?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-zinc-500">{label}</span>
      <input
        name={name}
        type="password"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        minLength={6}
        required
        autoComplete={autoComplete}
        className="rounded-xl border border-zinc-300 bg-transparent px-4 py-3 text-lg tracking-[0.5em] dark:border-zinc-700"
      />
    </label>
  );
}

export function FormMessage({ state }: { state: { ok: boolean; message?: string } }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`rounded-xl p-3 text-sm ${
        state.ok
          ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
      }`}
    >
      {state.message}
    </p>
  );
}
