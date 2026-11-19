import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in · Hotel Geo Vouchers" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-10">
      <header className="text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Hotel Geo
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Log in</h1>
      </header>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
