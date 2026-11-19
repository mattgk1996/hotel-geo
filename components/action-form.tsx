"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormMessage } from "@/components/pin-input";
import type { FormState } from "@/lib/form";

/** A form bound to a server action `(prev, formData) => FormState`, showing its message. */
export function ActionForm({
  action,
  children,
  submitLabel,
  className = "flex flex-col gap-3",
  resetOnSuccess = false,
  buttonClass = "rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50",
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  resetOnSuccess?: boolean;
  buttonClass?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <FormMessage state={state} />
      <button disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
