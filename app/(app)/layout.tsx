import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return (
    <>
      <AppHeader staff={staff} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">{children}</main>
    </>
  );
}

function ShellSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl animate-pulse px-4 py-6">
      <div className="h-6 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-6 h-32 rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}
