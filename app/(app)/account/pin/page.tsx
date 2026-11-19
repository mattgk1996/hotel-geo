import { requireStaff } from "@/lib/auth/session";
import { ChangePinForm } from "./change-pin-form";

export default async function ChangePinPage() {
  const me = await requireStaff();
  return (
    <section className="max-w-sm">
      <h1 className="text-2xl font-semibold">Change PIN</h1>
      <p className="mt-1 text-sm text-zinc-500">Logged in as {me.username}</p>
      <ChangePinForm />
    </section>
  );
}
