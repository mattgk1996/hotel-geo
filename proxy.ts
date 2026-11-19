import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSessionTooOld } from "@/lib/auth/session-age";

const PUBLIC_PATHS = ["/login"];

/**
 * Refreshes the Supabase session cookie on every page request, sends logged-out visitors to
 * /login, and ends sessions 12 hours after the PIN was entered. Pages still check roles
 * themselves (requireRole) — this is the first gate, not the only one.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  let claims = data?.claims ?? null;
  const path = request.nextUrl.pathname;
  let expired = false;

  if (claims && isSessionTooOld(claims)) {
    await supabase.auth.signOut();
    claims = null;
    expired = true;
  }

  const redirectTo = (pathname: string, params?: Record<string, string>) => {
    const target = request.nextUrl.clone();
    target.pathname = pathname;
    target.search = params ? `?${new URLSearchParams(params)}` : "";
    const res = NextResponse.redirect(target);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    response.headers.forEach((v, k) => {
      if (k.toLowerCase() !== "location" && k.toLowerCase() !== "set-cookie") res.headers.set(k, v);
    });
    return res;
  };

  const isPublic = PUBLIC_PATHS.includes(path);
  if (!claims && !isPublic) return redirectTo("/login", expired ? { expired: "1" } : undefined);
  if (claims && (isPublic || path === "/")) return redirectTo("/home");
  return response;
}

export const config = {
  matcher: [
    // Everything except API routes, Next.js internals and static files.
    "/((?!api/|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
