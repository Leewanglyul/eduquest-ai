import { describe, expect, it } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";

// Simulates an EXPIRED access token (expires_at in the past, refresh token still valid) and checks
// that the middleware refreshes it and hands the browser new cookies. The same flow in a Server
// Component could not persist cookies, which is what signed users out after one JWT lifetime.

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Session = { access_token: string; refresh_token: string; expires_at: number };

const isSessionCookie = (name: string) => /^sb-.+-auth-token(\.\d+)?$/.test(name);
const baseName = (name: string) => name.replace(/\.\d+$/, "");

function decode(raw: string): Session {
  const json = raw.startsWith("base64-")
    ? Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8")
    : raw;
  return JSON.parse(json);
}

function encodeLike(original: string, session: Session): string {
  const json = JSON.stringify(session);
  return original.startsWith("base64-") ? "base64-" + Buffer.from(json).toString("base64url") : json;
}

/** Sign in through a cookie-jar client, exactly how the app's server actions persist a session. */
async function signInCookies(email: string, password: string) {
  const jar = new Map<string, string>();
  const supabase = createServerClient(url(), anon(), {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list: { name: string; value: string }[]) => list.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  return jar;
}

function sessionFromJar(jar: Map<string, string>) {
  const chunks = [...jar].filter(([n]) => isSessionCookie(n)).sort(([a], [b]) => a.localeCompare(b));
  const name = baseName(chunks[0][0]);
  const raw = chunks.map(([, v]) => v).join("");
  return { name, raw, session: decode(raw) };
}

const cookieHeader = (cookies: [string, string][]) =>
  cookies.map(([n, v]) => `${n}=${v}`).join("; ");

describe("session refresh middleware", () => {
  it("refreshes an expired access token and issues new session cookies", async () => {
    const jar = await signInCookies("teacher@example.com", "DevTeacher#12345");
    const { name, raw, session } = sessionFromJar(jar);
    expect(session.expires_at * 1000).toBeGreaterThan(Date.now());

    // Make the session look expired (the refresh token is untouched and still valid).
    const expired = { ...session, expires_at: Math.floor(Date.now() / 1000) - 60 };
    const request = new NextRequest("http://localhost/teacher/classrooms", {
      headers: { cookie: cookieHeader([[name, encodeLike(raw, expired)]]) },
    });

    const response = await middleware(request);

    const refreshed = response.cookies.getAll().filter((c) => isSessionCookie(c.name));
    expect(refreshed.length).toBeGreaterThan(0);
    const next = decode(refreshed.map((c) => c.value).join(""));
    expect(next.expires_at * 1000).toBeGreaterThan(Date.now());
    expect(next.refresh_token).not.toBe(session.refresh_token); // rotated
    expect(next.access_token).not.toBe(session.access_token);

    // The refreshed session works: the new cookies authenticate against the Auth server.
    const verify = createServerClient(url(), anon(), {
      cookies: {
        getAll: () => response.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
        setAll: () => {},
      },
    });
    const { data } = await verify.auth.getUser();
    expect(data.user?.email).toBe("teacher@example.com");
  });

  it("leaves a still-valid session untouched", async () => {
    const jar = await signInCookies("teacher@example.com", "DevTeacher#12345");
    const { name, raw } = sessionFromJar(jar);
    const request = new NextRequest("http://localhost/teacher", {
      headers: { cookie: cookieHeader([[name, raw]]) },
    });
    const response = await middleware(request);
    expect(response.status).toBe(200);
    expect(response.cookies.getAll().filter((c) => isSessionCookie(c.name))).toHaveLength(0);
  });

  it("passes signed-out requests through without setting cookies", async () => {
    const response = await middleware(new NextRequest("http://localhost/teacher/sign-in"));
    expect(response.status).toBe(200);
    expect(response.cookies.getAll()).toHaveLength(0);
  });
});
