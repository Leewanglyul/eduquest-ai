#!/usr/bin/env node
// Switch the active Next.js environment file (.env.local) between the LOCAL Supabase stack and a
// HOSTED Supabase project. No dependencies. Never prints secret values.
//
//   pnpm env:local                     activate the local profile
//   pnpm env:hosted                    activate the hosted profile
//   pnpm env:hosted -- --allow-production   (only for a profile labelled "production")
//   pnpm env:status                    show which profile is active (host and key presence only)
//
// Profiles live in .env.profiles/{local,hosted}.env (git-ignored). Templates: .env.local.example,
// .env.hosted.example. Restart `pnpm dev` after switching, and rebuild before `pnpm start`:
// the NEXT_PUBLIC_* values are inlined into the build.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const ACTIVE = join(ROOT, ".env.local");
const BACKUP = join(ROOT, ".env.local.bak");
const DIR = join(ROOT, ".env.profiles");
const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const HEADER = /^# Active profile: (\w+)/m;

const args = process.argv.slice(2).filter((a) => a !== "--");
const command = args.find((a) => !a.startsWith("--"));
const allowProduction = args.includes("--allow-production");

function parse(text) {
  const vars = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[line.slice(0, i).trim()] = value;
  }
  return vars;
}

const read = (path) => parse(readFileSync(path, "utf8"));
const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};
const fail = (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

/** Returns a list of problems; empty means the profile is safe to activate. */
function validate(name, vars) {
  const problems = [];
  for (const key of REQUIRED) {
    const value = vars[key];
    if (!value) problems.push(`${key} is missing or empty`);
    else if (/[<>]/.test(value)) problems.push(`${key} still contains a placeholder (${key}=<...>)`);
  }
  if (problems.length) return problems;

  const url = vars.NEXT_PUBLIC_SUPABASE_URL;
  const host = hostOf(url);
  if (!host) return [`NEXT_PUBLIC_SUPABASE_URL is not a valid URL`];
  const local = LOCAL_HOSTS.has(host);
  if (name === "local" && !local) problems.push(`the local profile must point at 127.0.0.1/localhost (got ${host})`);
  if (name === "hosted") {
    if (local) problems.push(`the hosted profile points at a local address (${host}); use pnpm env:local for that`);
    if (!url.startsWith("https://")) problems.push(`the hosted URL must use https`);
    const label = vars.EDUQUEST_PROFILE_LABEL;
    if (label !== "staging" && label !== "production") {
      problems.push(`set EDUQUEST_PROFILE_LABEL=staging or production in the hosted profile`);
    }
  }
  if (vars.NEXT_PUBLIC_SUPABASE_ANON_KEY === vars.SUPABASE_SERVICE_ROLE_KEY) {
    problems.push(`the anon key and the service-role key are identical`);
  }
  return problems;
}

/** Local profile straight from the running Supabase CLI stack (values are the public local defaults). */
function fromSupabaseCli() {
  // Try the binary directly; if it is only reachable through a shell shim (for example a .cmd from
  // npm on Windows), retry through the shell using a fixed command string.
  let r = spawnSync("supabase", ["status", "-o", "env"], { encoding: "utf8" });
  if (r.error) r = spawnSync("supabase status -o env", { encoding: "utf8", shell: true });
  if (r.status !== 0 || !r.stdout) return null;
  const v = parse(r.stdout);
  if (!v.API_URL || !v.ANON_KEY || !v.SERVICE_ROLE_KEY) return null;
  return {
    NEXT_PUBLIC_SUPABASE_URL: v.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: v.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: v.SERVICE_ROLE_KEY,
  };
}

function writeProfile(name, vars, comment) {
  mkdirSync(DIR, { recursive: true });
  const body = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n");
  writeFileSync(join(DIR, `${name}.env`), `# ${comment}\n# Not committed (.env.profiles/ is git-ignored).\n${body}\n`);
}

function activate(name) {
  const profilePath = join(DIR, `${name}.env`);

  if (!existsSync(profilePath)) {
    if (name === "local") {
      const generated = fromSupabaseCli();
      if (!generated) {
        fail(
          "No local profile yet, and `supabase status -o env` is not available.\n" +
            "  1. Start the stack: supabase start\n" +
            "  2. Run this again, or copy .env.local.example to .env.profiles/local.env and fill it in.",
        );
      }
      writeProfile("local", generated, "Local Supabase profile (generated from `supabase status -o env`)");
      console.log("Created .env.profiles/local.env from the running Supabase stack.");
    } else {
      mkdirSync(DIR, { recursive: true });
      copyFileSync(join(ROOT, ".env.hosted.example"), profilePath);
      fail(
        "Created .env.profiles/hosted.env from the template.\n" +
          "Fill in the three values from Dashboard -> Project Settings -> API (use a STAGING project),\n" +
          "set EDUQUEST_PROFILE_LABEL, then run `pnpm env:hosted` again.",
      );
    }
  }

  const vars = read(profilePath);
  const problems = validate(name, vars);
  if (problems.length) fail(`Profile "${name}" is not usable:\n  - ${problems.join("\n  - ")}`);
  if (name === "hosted" && vars.EDUQUEST_PROFILE_LABEL === "production" && !allowProduction) {
    fail(
      'This hosted profile is labelled "production". Day-to-day development must not use production.\n' +
        "If you really need it: pnpm env:hosted -- --allow-production",
    );
  }

  const out = `# Active profile: ${name} (written by pnpm env:${name}). Do not commit; edit .env.profiles/${name}.env instead.\n` +
    Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  if (existsSync(ACTIVE)) {
    const before = readFileSync(ACTIVE, "utf8");
    if (before !== out) copyFileSync(ACTIVE, BACKUP);
  }
  writeFileSync(ACTIVE, out);

  const host = hostOf(vars.NEXT_PUBLIC_SUPABASE_URL);
  console.log(`Active profile: ${name}${vars.EDUQUEST_PROFILE_LABEL ? ` (${vars.EDUQUEST_PROFILE_LABEL})` : ""}`);
  console.log(`  Supabase host: ${host}`);
  console.log("  Restart `pnpm dev`; rebuild before `pnpm start` (NEXT_PUBLIC_* values are inlined at build time).");
  if (name === "hosted") {
    console.log("  Hosted profile rules: `pnpm test:access` refuses to run; never run `supabase db reset` or load seed.sql;");
    console.log("  apply schema changes with `supabase db push` only.");
  }
}

function status() {
  if (!existsSync(ACTIVE)) {
    console.log("No .env.local. Run `pnpm env:local` or `pnpm env:hosted`.");
    return;
  }
  const text = readFileSync(ACTIVE, "utf8");
  const vars = parse(text);
  const host = hostOf(vars.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const kind = host ? (LOCAL_HOSTS.has(host) ? "local" : "hosted") : "unknown";
  const named = HEADER.exec(text)?.[1] ?? "unknown (hand-written .env.local)";
  console.log(`Active profile : ${named}`);
  console.log(`Points at      : ${kind}${host ? ` (${host})` : ""}${vars.EDUQUEST_PROFILE_LABEL ? `, label ${vars.EDUQUEST_PROFILE_LABEL}` : ""}`);
  for (const key of REQUIRED) console.log(`  ${key.padEnd(32)} ${vars[key] ? `set (${vars[key].length} chars)` : "MISSING"}`);
  console.log(`Profiles       : local ${existsSync(join(DIR, "local.env")) ? "present" : "absent"}, hosted ${existsSync(join(DIR, "hosted.env")) ? "present" : "absent"}`);
  if (kind === "hosted") console.log("Reminder: hosted profile active. Tests refuse to run; do not db reset or load seed.sql.");
}

if (command === "local" || command === "hosted") activate(command);
else if (command === "status") status();
else fail("usage: node scripts/env-profile.mjs <local|hosted|status> [--allow-production]");
