"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login, type LoginState } from "./actions";

const RECENT_KEY = "hg.recentUsernames";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function rememberUsername(username: string) {
  try {
    const next = [username, ...readRecent().filter((u) => u !== username)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode): the picker just stays empty.
  }
}

const noSubscribe = () => () => {};

export function LoginForm() {
  const router = useRouter();
  const expired = useSearchParams().get("expired") === "1";
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { ok: false });
  const recentJson = useSyncExternalStore(noSubscribe, () => JSON.stringify(readRecent()), () => "[]");
  const recent: string[] = JSON.parse(recentJson);

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && state.username) {
      rememberUsername(state.username);
      router.replace("/home");
      router.refresh();
    }
  }, [state, router]);

  // Clear the PIN after a failed attempt so the next try starts fresh.
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (!state.ok) setPin("");
  }

  function press(key: (typeof KEYS)[number]) {
    if (pending) return;
    if (key === "clear") return setPin("");
    if (key === "back") return setPin((p) => p.slice(0, -1));
    const next = (pin + key).slice(0, 6);
    setPin(next);
    if (next.length === 6 && username.trim()) {
      // Submit after React has rendered the 6th digit into the hidden input.
      setTimeout(() => formRef.current?.requestSubmit(), 0);
    }
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5">
      {expired && !state.error && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          You were logged out after 12 hours. Please log in again.
        </p>
      )}

      {recent.length > 0 && (
        <div>
          <p className="mb-2 text-sm text-zinc-500">Who are you?</p>
          <div className="flex flex-wrap gap-2">
            {recent.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUsername(u)}
                className={`rounded-full border px-4 py-2 text-sm font-medium ${
                  username === u
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-500">Username</span>
        <input
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          spellCheck={false}
          required
          className="rounded-xl border border-zinc-300 bg-transparent px-4 py-3 text-lg dark:border-zinc-700"
        />
      </label>

      <div>
        <span className="text-sm text-zinc-500">PIN</span>
        <input
          type="password"
          name="pin"
          value={pin}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setPin(v);
          }}
          inputMode="numeric"
          autoComplete="current-password"
          aria-label="6-digit PIN"
          className="sr-only"
        />
        <div className="mt-2 flex justify-center gap-3" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={`h-4 w-4 rounded-full border-2 ${
                i < pin.length ? "border-emerald-600 bg-emerald-600" : "border-zinc-400"
              }`}
            />
          ))}
        </div>
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            disabled={pending}
            className="h-16 rounded-2xl bg-zinc-100 text-2xl font-medium active:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:active:bg-zinc-700"
          >
            {k === "clear" ? <span className="text-base">Clear</span> : k === "back" ? "⌫" : k}
          </button>
        ))}
      </div>

      <button
        type="submit"
        disabled={pending || pin.length !== 6 || !username.trim()}
        className="h-14 rounded-2xl bg-emerald-700 text-lg font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
