import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Short-lived (10 min) signed URLs for a voucher's photos, in page order. */
export async function signedPhotoUrls(
  supabase: Supabase,
  images: { storage_path: string; page_no: number }[],
): Promise<string[]> {
  if (!images.length) return [];
  const sorted = [...images].sort((a, b) => a.page_no - b.page_no);
  const { data } = await supabase.storage.from("voucher-images").createSignedUrls(sorted.map((i) => i.storage_path), 600);
  return (data ?? []).map((s) => s.signedUrl).filter((u): u is string => !!u);
}
