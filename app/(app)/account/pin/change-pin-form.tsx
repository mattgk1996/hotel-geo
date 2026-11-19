"use client";

import { useActionState } from "react";
import { FormMessage, PinInput } from "@/components/pin-input";
import { changeOwnPin, type FormState } from "./actions";

export function ChangePinForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changeOwnPin, { ok: false });
  return (
    <form action={action} key={state.ok ? state.message : "form"} className="mt-6 flex flex-col gap-4">
      <PinInput name="current" label="Current PIN" autoComplete="current-password" />
      <PinInput name="next" label="New PIN" autoComplete="new-password" />
      <PinInput name="confirm" label="New PIN again" autoComplete="new-password" />
      <FormMessage state={state} />
      <button disabled={pending} className="h-12 rounded-xl bg-emerald-700 font-semibold text-white disabled:opacity-50">
        {pending ? "Saving…" : "Change PIN"}
      </button>
    </form>
  );
}
