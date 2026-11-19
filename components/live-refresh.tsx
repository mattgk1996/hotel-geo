"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Re-renders the page (server data) shortly after any change to the given tables (Supabase Realtime). */
export function LiveRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const key = tables.join(",");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 1500);
    };
    let channel: ReturnType<typeof supabase.channel> | undefined;
    (async () => {
      await supabase.realtime.setAuth(); // use the logged-in session so RLS applies to the stream
      channel = supabase.channel("dashboard");
      for (const table of key.split(",")) {
        channel.on("postgres_changes", { event: "*", schema: "public", table }, bump);
      }
      channel.subscribe((status) => setLive(status === "SUBSCRIBED"));
    })();
    return () => {
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [key, router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
      <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-zinc-400"}`} aria-hidden />
      {live ? "Live" : "Connecting…"}
    </span>
  );
}
