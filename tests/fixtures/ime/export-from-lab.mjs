// Turns IME lab traces (scripts/ime-lab/traces/*.json) into compact, replayable fixtures for the controller tests.
//   node tests/fixtures/ime/export-from-lab.mjs <out-name> <trace.json> [caseId[:index] ...]
// With no case list every recorded run of the file is exported. Only what ImeEvent needs is kept: no user agent,
// no notes, no timing. The lab log is the source of truth; this script never edits a value.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [outName, tracePath, ...picks] = process.argv.slice(2);
if (!outName || !tracePath) { console.error("usage: export-from-lab.mjs <out-name> <trace.json> [case ...]"); process.exit(1); }

const CELLS = { c1: 1, c2: 2, c3: 2, c4: 3, c5: 4, c6: 1, c7: 2, c8: 3, c9: 3, c10: 2 };
const clean = (v) => (typeof v === "string" ? v.replace(/‹S›/g, "").replace(/​/g, "") : "");

// Lab v2 runs often continue after the proxy trial (the tester pressed "end", then also tried the word field in the
// same case). The lab's own record of what the proxy committed (r.commits) says where the proxy trial ended: keep the
// log up to the first blur (the click on "end") after the commits reached r.commits. A run whose commits never reach
// r.commits (the tester kept typing in a contaminated run) cannot be cut reliably and is skipped.
function cutAtProxyTrial(log, commits) {
  let acc = "";
  let reached = -1;
  for (let i = 0; i < log.length; i++) {
    const l = log[i];
    if (l.type === "commit" && l.src !== "word") acc += l.text ?? "";
    if (acc === commits && commits !== "") { reached = i; break; }
  }
  if (reached < 0) return null;
  const blur = log.findIndex((l, i) => i > reached && l.type === "blur");
  return log.slice(0, blur < 0 ? reached + 1 : blur);
}

function toEvents(log) {
  const out = [];
  for (const l of log) {
    switch (l.type) {
      case "compositionstart": out.push({ type: "compositionstart" }); break;
      case "compositionupdate": out.push({ type: "compositionupdate", data: clean(l.data) }); break;
      case "compositionend": out.push({ type: "compositionend", data: clean(l.data), value: clean(l.value) }); break;
      case "input": out.push({ type: "input", inputType: l.inputType ?? "", data: l.data === undefined || l.data === null ? null : clean(l.data), isComposing: Boolean(l.isComposing), value: clean(l.value) }); break;
      case "keydown": out.push({ type: "keydown", key: l.key ?? "", keyCode: l.keyCode ?? 0, isComposing: Boolean(l.isComposing), valueEmpty: clean(l.value) === "" }); break;
      case "blur": out.push({ type: "blur" }); break;
      case "paste": out.push({ type: "paste", text: l.text ?? "" }); break;
      case "cell-tap": out.push({ type: "select", index: l.i }); break;
      default: break;
    }
  }
  return out;
}

const d = JSON.parse(readFileSync(tracePath, "utf8"));
const wanted = picks.map((p) => { const [c, i] = p.split(":"); return { c, i: i === undefined ? null : Number(i) }; });
const counter = {};
const runs = [];
d.results.forEach((r, idx) => {
  counter[r.case] = (counter[r.case] ?? -1) + 1;
  if (r.approach !== "proxy") return;
  if (wanted.length && !wanted.some((w) => w.c === r.case && (w.i === null || w.i === counter[r.case]))) return;
  const trial = (d.labVersion ?? 1) >= 2 ? cutAtProxyTrial(r.log, r.commits) : r.log;
  if (!trial) { console.error(`skipped ${r.case}#${counter[r.case]}: commits never reach the recorded value`); return; }
  runs.push({ id: `${r.case}#${counter[r.case]}`, case: r.case, n: CELLS[r.case], expected: r.expected, got: r.got, testerVerdict: r.verdict, autoPass: r.autoPass, focusLost: r.flags.focusLost, events: toEvents(trial) });
});
const fixture = { source: { trace: tracePath.split(/[\/]/).pop(), labVersion: d.labVersion ?? 1, device: d.device, savedAt: d.savedAt }, runs };
writeFileSync(join(here, `${outName}.json`), JSON.stringify(fixture));
console.log(`${outName}: ${runs.length} runs, ${runs.reduce((n, r) => n + r.events.length, 0)} events`);
