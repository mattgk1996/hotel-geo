import { getAppHealth } from "@/lib/health";

export async function GET() {
  const health = await getAppHealth();
  return Response.json(health, {
    status: health.status === "connected" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
