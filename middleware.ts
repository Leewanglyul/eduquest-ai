import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Session refresh (the @supabase/ssr recommended Next.js pattern).
 *
 * Server Components cannot write cookies, so an expired access token could never be refreshed
 * there and users were bounced to sign-in once the token (default 1 h) expired. Middleware CAN
 * write cookies: it calls getUser() (which refreshes an expired access token with the refresh
 * token) and copies the new cookies onto BOTH the incoming request (so this request's Server
 * Components see the fresh session) and the outgoing response (so the browser stores it).
 *
 * Authorization is NOT done here: role / must_change_password checks stay in the page guards.
 * This file only keeps the session alive. (No `server-only` env helper: middleware runs on the
 * Edge runtime; NEXT_PUBLIC_* values are inlined at build time.)
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  try {
    // Validates the token with the Auth server and refreshes it when expired.
    await supabase.auth.getUser();
  } catch {
    // Auth server unreachable: let the request through; page guards will deny if needed.
  }

  return response;
}

export const config = {
  matcher: ["/teacher/:path*", "/student/:path*"],
};
