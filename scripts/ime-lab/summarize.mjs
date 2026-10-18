// Reads ./traces/*.json and prints a pass/fail matrix (case x device/approach) plus the failed checks.
// Usage: node scripts/ime-lab/summarize.mjs
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "traces");
const names = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".json")).sort();
if (names.length === 0) { console.log("no traces yet"); process.exit(0); }

const rows = new Map(); // key "device | approach+sentinel | kbd | orientation" -> {case: verdict}
const failures = [];
const usable = new Map();
for (const f of names) {
  const d = JSON.parse(await readFile(join(dir, f), "utf8"));
  if (d.usable) usable.set(d.device, d.usable);
  for (const r of d.results || []) {
    const ver = d.labVersion === 2 ? "v2" : "v1";
    const key = `[${ver}] ${d.device}${d.keyboardApp ? " (" + d.keyboardApp + ")" : ""} | ${r.approach.toUpperCase()}${r.sentinel ? "+S" : ""} | ${r.kbd} | ${r.orientation.replace("-primary", "")}`;
    if (!rows.has(key)) rows.set(key, {});
    const ok = r.verdict === "pass" && r.autoPass;
    rows.get(key)[r.case] = r.verdict === "pass" ? (r.autoPass ? "ok" : "ok*") : "FAIL";
    if (!ok) failures.push({ key, case: r.case, verdict: r.verdict, failed: Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k), got: r.got, expected: r.expected, note: r.note });
  }
}
const cases = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10"];
console.log("v1 rows: first lab, whose deferred value reset broke the Windows syllable hand-off (docs/m2/08 section 0.3). Regression data, not a verdict.\n");
console.log(["run".padEnd(78), ...cases.map((c) => c.padEnd(5))].join(" "));
for (const [k, v] of rows) console.log([k.padEnd(78), ...cases.map((c) => (v[c] || "-").padEnd(5))].join(" "));
console.log("\nok = tester pass and automatic checks pass; ok* = tester pass but an automatic check failed; FAIL = tester fail; - = not run");
if (failures.length) {
  console.log("\nDetails of non-clean runs:");
  for (const f of failures) console.log(`- ${f.key} ${f.case}: tester=${f.verdict} failed=[${f.failed.join(", ")}] got="${f.got}" expected="${f.expected}"${f.note ? ` note="${f.note}"` : ""}`);
}
if (usable.size) { console.log("\nSC6 (usable) per device:"); for (const [d, u] of usable) console.log(`- ${d}: ${u}`); }
