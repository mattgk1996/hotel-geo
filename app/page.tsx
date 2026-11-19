import { redirect } from "next/navigation";

// proxy.ts already routes "/" to /home or /login; this is the fallback.
export default function Root() {
  redirect("/home");
}
