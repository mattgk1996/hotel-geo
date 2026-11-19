"use client";

import { useActionState, useState } from "react";
import { FormMessage, PinInput } from "@/components/pin-input";
import { ROLES, ROLE_LABELS } from "@/lib/auth/roles";
import { createStaff, resetPin, type FormState } from "./actions";

const field = "rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 dark:border-zinc-700";

export function AddStaffForm({ departments }: { departments: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createStaff, { ok: false });
  return (
    // Re-mount (clear) the form after each successful add.
    <form key={state.ok ? state.message : "add"} action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-500">Full name</span>
        <input name="full_name" required className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-500">Username (used to log in)</span>
        <input name="username" required autoCapitalize="none" autoCorrect="off" pattern="[a-z0-9._\-]{2,32}" className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-500">Role</span>
        <select name="role" defaultValue="staff" className={field}>
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-500">Department</span>
        <select name="department_id" required className={field}>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-500">Phone (optional)</span>
        <input name="phone" type="tel" className={field} />
      </label>
      <PinInput name="pin" label="Starting PIN (6 digits)" autoComplete="new-password" />
      <div className="sm:col-span-2 flex flex-col gap-3">
        <FormMessage state={state} />
        <button disabled={pending} className="h-12 rounded-xl bg-emerald-700 font-semibold text-white disabled:opacity-50">
          {pending ? "Adding…" : "Add staff"}
        </button>
      </div>
    </form>
  );
}

export function ResetPinForm({ staffId }: { staffId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(resetPin, { ok: false });

  // Close the form once a reset succeeds.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setOpen(false);
  }

  if (!open) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        {state.ok && <FormMessage state={state} />}
        <button onClick={() => setOpen(true)} className="self-start text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Reset PIN
        </button>
      </div>
    );
  }
  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="staff_id" value={staffId} />
      <PinInput name="pin" label="New PIN" autoComplete="new-password" />
      {!state.ok && <FormMessage state={state} />}
      <div className="flex gap-2">
        <button disabled={pending} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Saving…" : "Set PIN"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
