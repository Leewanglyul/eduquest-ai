/* M2-2.4a IME lab. Throwaway spike code: logs raw events, applies the simplest possible commit rules,
   and judges each run against the PM success criteria (SC1-SC6). Not app code. */
"use strict";

const LAB_VERSION = 2;
const SENT = "​";
const $ = (s) => document.querySelector(s);

/* ------------------------------------------------------------------ cases */
// steps: what to type. expected: final cells. commitCheck: commits should equal expected exactly once.
const CASES = [
  { id: "c1", label: "한 칸 입력", n: 1, expected: "가", commitCheck: true, steps: "칸이 1개입니다. <b>ㄱ ㅏ</b> 를 쳐서 <b>가</b>." },
  { id: "c2", label: "음절 완성", n: 2, expected: "사과", commitCheck: true, steps: "<b>ㅅ ㅏ ㄱ ㅗ ㅏ</b> 를 이어서 쳐서 <b>사과</b>." },
  { id: "c3", label: "받침 넘김 (안+ㅏ)", n: 2, expected: "아나", commitCheck: true, steps: "<b>ㅇ ㅏ ㄴ ㅏ</b> → <b>아나</b>. 'ㄴ'이 앞 글자 받침에서 뒤 글자로 넘어가야 합니다. 마지막에 <b>스페이스</b>(또는 →)를 눌러 조합을 끝내세요." },
  { id: "c4", label: "겹받침·여러 글자", n: 3, expected: "닭고기", commitCheck: true, steps: "<b>ㄷ ㅏ ㄹ ㄱ ㄱ ㅗ ㄱ ㅣ</b> → <b>닭고기</b>. 마지막에 <b>스페이스</b>(또는 →)로 조합을 끝내세요." },
  { id: "c5", label: "빠르게 입력", n: 4, expected: "대한민국", commitCheck: true, steps: "<b>대한민국</b> (ㄷㅐㅎㅏㄴㅁㅣㄴㄱㅜㄱ)을 <u>가능한 한 빠르게</u> 한 번에 친 뒤 <b>스페이스</b>(또는 →)로 조합을 끝내세요." },
  { id: "c6", label: "조합 중 Backspace", n: 1, expected: "사", commitCheck: true, steps: "<b>ㅅ ㅏ ㄴ</b> (산) → <b>Backspace</b> (사) → <b>Backspace</b> (ㅅ) → <b>ㅏ</b> → 결과 <b>사</b>. 한 번에 이어서 하고, Backspace는 <u>정확히 2번</u>만 누르세요. 화면에 <b>산 → 사 → ㅅ</b> 순서로 보여야 합니다. 마지막에 <b>스페이스</b>(또는 →)로 조합을 끝내세요." },
  { id: "c7", label: "확정 후 Backspace", n: 2, expected: "나", commitCheck: false, steps: "<b>사과</b> 입력 → 두 칸이 모두 빌 때까지 <b>Backspace</b>를 누르세요 (마지막 글자는 아직 조합 중이라 자모 단위로 지워질 수 있습니다. 그것도 정상입니다) → <b>나</b> 입력 → 스페이스(또는 →) → 첫 칸 <b>나</b>, 둘째 칸 비어 있음." },
  { id: "c8", label: "확정 후 포커스 이동", n: 3, expected: "가나", commitCheck: true, expectSel: 2, steps: "<b>가</b>, <b>나</b>를 천천히 입력한 뒤 <b>스페이스</b>(또는 →)로 조합을 끝내세요. 입력 위치가 <b>세 번째 칸</b>에 있어야 하고, 조합 도중 입력 위치가 옮겨지면 안 됩니다." },
  { id: "c9", label: "붙여넣기", n: 3, expected: "사과나", commitCheck: false, paste: true, steps: "아래 칸의 <b>사과나무</b>를 복사해 입력 위치에 <b>붙여넣기</b>. 칸이 3개이므로 <b>사과나</b>만 들어가야 합니다." },
  { id: "c10", label: "영문·숫자 칸", n: 2, expected: "A1", commitCheck: true, steps: "한/영 키로 영문으로 바꾸고 <b>a</b>, <b>1</b> 입력 → <b>A1</b> (소문자는 대문자로)." },
];

/* ------------------------------------------------------------------ state */
const st = {
  caseDef: null,
  n: 0,
  cells: [],
  sel: 0,
  selRaw: 0,
  composing: false,
  anchor: 0,
  buf: "",
  log: [],
  t0: 0,
  flags: { focusLost: 0, rejected: [] },
  commits: [],
  results: [],
  pending: null,
  committedLen: 0,
  bufHistory: [],
  suppressBlur: false,
};

const approach = () => document.querySelector('input[name=approach]:checked').value;
const kbd = () => document.querySelector('input[name=kbd]:checked').value;
const useSentinel = () => $("#sentinel").checked;

/* ------------------------------------------------------------------ helpers */
const upperAscii = (t) => t.replace(/[a-z]/g, (c) => c.toUpperCase());
const strip = (t) => (t || "").replace(/​/g, "");
const normalize = (t) => upperAscii(strip(t).normalize("NFC"));
const validChar = (ch) => /^[가-힣]$/.test(ch) || /^[A-Z0-9]$/.test(ch);
const show = (s) => (s || "").replace(/​/g, "‹S›");

function log(type, extra) {
  if (st.log.length > 3000) return;
  st.log.push(Object.assign({ t: Math.round(performance.now() - st.t0), type }, extra || {}));
}
function logEvent(e, tag) {
  log(tag || e.type, {
    data: e.data === undefined ? undefined : show(e.data),
    inputType: e.inputType,
    key: e.key,
    keyCode: e.keyCode,
    isComposing: e.isComposing,
    value: e.target && "value" in e.target ? show(e.target.value) : undefined,
    sel: st.sel,
    composing: st.composing,
  });
}

function updateEnv() {
  const o = (screen.orientation && screen.orientation.type) || (innerWidth > innerHeight ? "landscape" : "portrait");
  $("#env").textContent = `${innerWidth}x${innerHeight}px, ${o}, UA: ${navigator.userAgent}`;
}
addEventListener("resize", updateEnv);
updateEnv();

/* ------------------------------------------------------------------ shared commit rules */
// Writes valid characters into consecutive cells from `start`. Lone jamo and symbols are rejected.
function commitText(raw, start, src) {
  const chars = Array.from(normalize(raw));
  let i = start;
  const written = [];
  for (const ch of chars) {
    if (!validChar(ch)) {
      st.flags.rejected.push(ch);
      log("reject", { ch, src });
      continue;
    }
    if (i >= st.n) {
      log("overflow", { ch, src });
      break;
    }
    st.cells[i] = ch;
    st.commits.push(ch);
    written.push(ch);
    i++;
  }
  st.selRaw = i;
  st.sel = Math.min(i, st.n - 1);
  log("commit", { src, text: written.join(""), from: start, selRaw: i });
  return i - start;
}

function doBackspace(src) {
  if (st.cells[st.sel]) {
    st.cells[st.sel] = "";
  } else if (st.sel > 0) {
    st.sel--;
    st.cells[st.sel] = "";
  }
  st.selRaw = st.sel;
  log("backspace", { src, sel: st.sel });
}

/* ------------------------------------------------------------------ rendering */
let proxy = null;
let cellEls = [];
let perCellInputs = [];

function buildUi() {
  const grid = $("#grid");
  grid.innerHTML = "";
  cellEls = [];
  perCellInputs = [];
  proxy = null;
  const a = approach();
  $("#wordBox").hidden = a !== "word";
  for (let i = 0; i < st.n; i++) {
    const d = document.createElement("div");
    d.className = "cell";
    if (a === "percell") {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.setAttribute("autocomplete", "off");
      inp.setAttribute("autocapitalize", "off");
      inp.setAttribute("autocorrect", "off");
      inp.setAttribute("spellcheck", "false");
      inp.setAttribute("aria-label", `${i + 1}번째 칸`);
      wirePerCell(inp, i);
      d.appendChild(inp);
      perCellInputs.push(inp);
    } else if (a === "proxy") {
      d.addEventListener("pointerdown", (e) => {
        e.preventDefault(); // keep focus (and any composition) in the proxy
        st.sel = i;
        st.selRaw = i;
        log("cell-tap", { i, composing: st.composing });
        render();
        if (proxy) proxy.focus();
      });
    }
    grid.appendChild(d);
    cellEls.push(d);
  }
  if (a === "proxy") {
    proxy = document.createElement("input");
    proxy.id = "proxy";
    proxy.type = "text";
    proxy.setAttribute("autocomplete", "off");
    proxy.setAttribute("autocapitalize", "off");
    proxy.setAttribute("autocorrect", "off");
    proxy.setAttribute("spellcheck", "false");
    proxy.setAttribute("aria-label", "낱말 입력 칸");
    proxy.className = $("#showProxy").checked ? "visible" : "";
    wireProxy(proxy);
    grid.appendChild(proxy);
    idleReset();
  }
  render();
}

function render() {
  const a = approach();
  const pendingChars = a === "proxy" && st.composing ? Array.from(strip(st.buf)) : [];
  cellEls.forEach((el, i) => {
    el.classList.toggle("sel", i === st.sel);
    const pi = i - st.anchor;
    const isPending = pendingChars.length > 0 && pi >= 0 && pi < pendingChars.length;
    el.classList.toggle("pending", isPending);
    if (a === "percell") {
      const inp = perCellInputs[i];
      if (!(st.composing && document.activeElement === inp)) inp.value = st.cells[i] || "";
    } else {
      el.textContent = isPending ? pendingChars[pi] : st.cells[i] || "";
    }
  });
  if (proxy && cellEls[st.sel]) {
    const c = cellEls[st.sel];
    proxy.style.left = c.offsetLeft + "px";
    proxy.style.top = c.offsetTop + "px";
    proxy.style.width = c.offsetWidth + "px";
    proxy.style.height = c.offsetHeight + "px";
  }
  $("#live").textContent = `칸: [${st.cells.map((c) => c || "·").join("")}]  선택=${st.sel + 1}  조합중=${st.composing}  버퍼="${strip(st.buf)}"  확정=${st.commits.join("")}`;
}

/* ------------------------------------------------------------------ A: proxy input */
// v2 (R2): the proxy value is never written while a composition is open. committedLen is the part of
// the value that is already committed to cells; the pending text is value.slice(committedLen), so no
// reset is needed between the two syllables of a hand-off.
function idleReset() {
  if (!proxy) return;
  if (st.composing) { log("reset-skipped", { reason: "composing" }); return; }
  proxy.value = useSentinel() ? SENT : "";
  st.committedLen = strip(proxy.value).length;
  try { proxy.setSelectionRange(proxy.value.length, proxy.value.length); } catch (_) { /* ignore */ }
}

function pushBuf(t) {
  if (st.bufHistory[st.bufHistory.length - 1] !== t) st.bufHistory.push(t);
}

function wireProxy(p) {
  p.addEventListener("focus", (e) => logEvent(e));
  p.addEventListener("blur", (e) => {
    logEvent(e);
    if (st.composing && !st.suppressBlur) {
      st.flags.focusLost++;
      log("FOCUS_LOST_DURING_COMPOSITION");
    }
  });
  p.addEventListener("compositionstart", (e) => {
    logEvent(e);
    if (st.composing) {
      // previous composition never reported compositionend (seen after an IME cancel)
      log("missing-compositionend", { buf: st.buf });
      if (st.buf) commitText(st.buf, st.anchor, "implicit-end");
    }
    st.composing = true;
    st.anchor = st.sel;
    st.buf = "";
    render();
  });
  p.addEventListener("compositionupdate", (e) => {
    logEvent(e);
    st.buf = strip(e.data != null ? e.data : strip(p.value).slice(st.committedLen));
    pushBuf(st.buf);
    render();
  });
  p.addEventListener("compositionend", (e) => {
    logEvent(e);
    // R1: use the event data (or the tracked buffer), never the whole value, which may still hold the previous syllable
    const text = strip(e.data != null && e.data !== "" ? e.data : st.buf);
    st.composing = false;
    st.buf = "";
    commitText(text, st.anchor, "compositionend");
    st.committedLen = strip(p.value).length;
    setTimeout(() => { idleReset(); render(); log("idle-reset-try", { src: "compositionend", composing: st.composing }); }, 0);
    render();
  });
  p.addEventListener("beforeinput", (e) => logEvent(e));
  p.addEventListener("input", (e) => {
    logEvent(e);
    const del = e.inputType && e.inputType.indexOf("deleteContent") === 0;
    if (st.composing && del && st.buf === "") {
      // R3: the IME unwound its last jamo; the composition is cancelled, nothing to commit
      st.composing = false;
      log("composition-cancel", { src: "input:" + e.inputType });
      st.committedLen = strip(p.value).length;
      setTimeout(() => { idleReset(); render(); }, 0);
      render();
      return;
    }
    if (st.composing || e.isComposing) {
      st.buf = e.inputType === "insertCompositionText" && e.data != null ? strip(e.data) : strip(strip(p.value).slice(st.committedLen));
      pushBuf(st.buf);
      render();
      return;
    }
    if (del) {
      doBackspace("input:" + e.inputType);
      idleReset();
      render();
      return;
    }
    // Not composing: keyboards that send finished text directly (or never fire composition events).
    const text = strip(strip(p.value).slice(st.committedLen));
    if (text) commitText(text, st.sel, "input:" + (e.inputType || "?"));
    idleReset();
    render();
  });
  p.addEventListener("keydown", (e) => {
    logEvent(e);
    if (st.composing || e.isComposing || e.keyCode === 229) return; // never intercept during composition
    if (e.key === "Backspace" && !useSentinel() && strip(p.value) === "") {
      e.preventDefault();
      doBackspace("keydown");
      render();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault(); st.sel = Math.max(0, st.sel - 1); st.selRaw = st.sel; render();
    } else if (e.key === "ArrowRight") {
      e.preventDefault(); st.sel = Math.min(st.n - 1, st.sel + 1); st.selRaw = st.sel; render();
    }
  });
  p.addEventListener("keyup", (e) => logEvent(e));
  p.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData && e.clipboardData.getData("text")) || "";
    log("paste", { text });
    commitText(text, st.sel, "paste");
    idleReset();
    render();
  });
}

/* ------------------------------------------------------------------ B: one input per cell */
function wirePerCell(inp, idx) {
  const focusCell = (i) => {
    const target = perCellInputs[Math.min(i, st.n - 1)];
    if (target) target.focus();
  };
  inp.addEventListener("focus", (e) => { st.sel = idx; logEvent(e); render(); });
  inp.addEventListener("blur", (e) => {
    logEvent(e);
    if (st.composing) {
      st.flags.focusLost++;
      log("FOCUS_LOST_DURING_COMPOSITION", { idx });
    }
  });
  inp.addEventListener("compositionstart", (e) => { logEvent(e); st.composing = true; st.anchor = idx; st.buf = ""; });
  inp.addEventListener("compositionupdate", (e) => { logEvent(e); st.buf = strip(e.data != null ? e.data : inp.value); render(); });
  inp.addEventListener("compositionend", (e) => {
    logEvent(e);
    const text = strip(e.data != null && e.data !== "" ? e.data : inp.value);
    st.composing = false;
    st.buf = "";
    commitText(text, idx, "compositionend");
    const next = st.selRaw;
    setTimeout(() => { render(); focusCell(next); log("focus-next", { next }); }, 0);
  });
  inp.addEventListener("beforeinput", (e) => logEvent(e));
  inp.addEventListener("input", (e) => {
    logEvent(e);
    if (st.composing || e.isComposing) return;
    const text = strip(inp.value);
    if (e.inputType && e.inputType.indexOf("deleteContent") === 0) {
      st.cells[idx] = text ? Array.from(normalize(text))[0] || "" : "";
      render();
      return;
    }
    if (text) {
      commitText(text, idx, "input:" + (e.inputType || "?"));
      const next = st.selRaw;
      setTimeout(() => { render(); focusCell(next); }, 0);
    }
  });
  inp.addEventListener("keydown", (e) => {
    logEvent(e);
    if (st.composing || e.isComposing || e.keyCode === 229) return;
    if (e.key === "Backspace" && inp.value === "" && idx > 0) {
      e.preventDefault();
      st.cells[idx - 1] = "";
      log("backspace", { src: "keydown-empty", idx });
      render();
      focusCell(idx - 1);
    }
  });
  inp.addEventListener("keyup", (e) => logEvent(e));
  inp.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData && e.clipboardData.getData("text")) || "";
    log("paste", { text });
    commitText(text, idx, "paste");
    const next = st.selRaw;
    render();
    focusCell(next);
  });
}

/* ------------------------------------------------------------------ C: word entry */
function wireWord() {
  const inp = $("#wordInput");
  const go = () => {
    log("word-go", { value: inp.value });
    st.cells = new Array(st.n).fill("");
    st.commits = [];
    commitText(inp.value, 0, "word");
    inp.value = "";
    render();
  };
  ["focus", "blur", "compositionstart", "compositionupdate", "compositionend", "beforeinput", "input", "keyup"].forEach((t) =>
    inp.addEventListener(t, (e) => {
      if (t === "compositionstart") st.composing = true;
      if (t === "compositionend") st.composing = false;
      logEvent(e);
    }),
  );
  inp.addEventListener("keydown", (e) => {
    logEvent(e);
    if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); go(); }
  });
  inp.addEventListener("paste", (e) => log("paste", { text: (e.clipboardData && e.clipboardData.getData("text")) || "" }));
  $("#wordGo").addEventListener("click", go);
}
wireWord();

/* ------------------------------------------------------------------ run control */
function startCase(def) {
  st.caseDef = def;
  st.n = def.n;
  st.cells = new Array(def.n).fill("");
  st.sel = 0;
  st.selRaw = 0;
  st.composing = false;
  st.buf = "";
  st.anchor = 0;
  st.log = [];
  st.t0 = performance.now();
  st.flags = { focusLost: 0, rejected: [] };
  st.commits = [];
  st.pending = null;
  st.committedLen = 0;
  st.bufHistory = [];
  st.suppressBlur = false;
  $("#runBox").hidden = false;
  $("#verdictBox").hidden = true;
  $("#runTitle").textContent = `3. 시험 ${def.id}: ${def.label} (방식 ${approach().toUpperCase()})`;
  $("#steps").innerHTML = def.steps + `<br><span class="muted">기대 결과: <b>${def.expected}</b>${def.expectSel != null ? `, 입력 위치 ${def.expectSel + 1}번째 칸` : ""}</span>`;
  $("#pasteSrcBox").hidden = !def.paste;
  $("#wordInput").value = "";
  buildUi();
  log("case-start", { id: def.id, approach: approach(), kbd: kbd(), sentinel: useSentinel() });
  if (approach() === "proxy" && proxy) proxy.focus();
  else if (approach() === "percell" && perCellInputs[0]) perCellInputs[0].focus();
  else if (approach() === "word") $("#wordInput").focus();
}

function count(arr) {
  const m = {};
  arr.forEach((c) => (m[c] = (m[c] || 0) + 1));
  return m;
}

function evaluate() {
  const def = st.caseDef;
  const got = st.cells.map((c) => c || "").join("");
  const exp = Array.from(def.expected);
  const gotArr = Array.from(got);
  const eg = count(gotArr), ee = count(exp);
  const checks = {};
  checks["SC1 중복 없음"] = Object.keys(eg).every((k) => eg[k] <= (ee[k] || 0));
  checks["SC2 누락 없음"] = Object.keys(ee).every((k) => (eg[k] || 0) >= ee[k]);
  checks["결과 일치"] = got === def.expected;
  checks["SC3 조합 중 포커스 이동 없음"] = st.flags.focusLost === 0;
  if (def.commitCheck) checks["SC5 한 번만 확정"] = st.commits.join("") === def.expected;
  if (def.expectSel != null) checks["확정 후 위치"] = st.selRaw === def.expectSel;
  if (def.id === "c6") {
    const want = ["ㅅ", "사", "산", "사", "ㅅ", "사"]; // pending text seen on screen, in order
    let k = 0;
    st.bufHistory.forEach((b) => { if (k < want.length && b === want[k]) k++; });
    checks["SC4 조합 중 Backspace"] = got === def.expected && st.flags.focusLost === 0 && k === want.length;
  }
  return { got, checks, allPass: Object.values(checks).every(Boolean) };
}

function finishCase() {
  if (!st.caseDef) return;
  if (st.composing) { // the tester pressed the button mid-composition: flush it, do not count the blur
    const t = st.buf;
    st.composing = false;
    st.buf = "";
    log("flush-on-finish", { text: t });
    if (t) commitText(t, st.anchor, "flush-on-finish");
  }
  st.suppressBlur = false;
  const ev = evaluate();
  st.pending = ev;
  const html = [`<p>결과 칸: <b>[${ev.got || "(비어 있음)"}]</b> / 기대 <b>[${st.caseDef.expected}]</b> / 확정 순서 <b>${st.commits.join("") || "-"}</b>`];
  if (st.flags.rejected.length) html.push(` / 거부된 문자: ${st.flags.rejected.join(" ")}`);
  html.push("</p><div>");
  Object.entries(ev.checks).forEach(([k, v]) => html.push(`<span class="pill ${v ? "pass" : "fail"}">${v ? "✓" : "✗"} ${k}</span>`));
  html.push("</div>");
  $("#auto").innerHTML = html.join("");
  $("#note").value = "";
  $("#logDump").textContent = st.log.map((l) => JSON.stringify(l)).join("\n");
  $("#verdictBox").hidden = false;
}

function recordVerdict(verdict) {
  if (!st.pending) return;
  const o = (screen.orientation && screen.orientation.type) || (innerWidth > innerHeight ? "landscape" : "portrait");
  st.results.push({
    case: st.caseDef.id,
    label: st.caseDef.label,
    approach: approach(),
    sentinel: useSentinel(),
    kbd: kbd(),
    keyboardApp: $("#kbdApp").value.trim(),
    prediction: $("#prediction").checked,
    bufHistory: st.bufHistory.slice(),
    orientation: o,
    viewport: [innerWidth, innerHeight],
    expected: st.caseDef.expected,
    got: st.pending.got,
    selRaw: st.selRaw,
    commits: st.commits.join(""),
    checks: st.pending.checks,
    autoPass: st.pending.allPass,
    flags: st.flags,
    verdict,
    note: $("#note").value,
    log: st.log,
  });
  st.pending = null;
  $("#verdictBox").hidden = true;
  renderResults();
}

function renderResults() {
  const tb = $("#results tbody");
  tb.innerHTML = "";
  st.results.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.case} ${r.label}<br><span class="muted">${r.kbd}, ${r.orientation.replace("-primary", "")}</span></td><td>${r.approach.toUpperCase()}${r.sentinel ? "+S" : ""}</td><td class="${r.autoPass ? "pass" : "fail"}">${r.autoPass ? "통과" : "실패"}</td><td class="${r.verdict === "pass" ? "pass" : "fail"}">${r.verdict === "pass" ? "통과" : "실패"}</td>`;
    tb.appendChild(tr);
  });
}

function payload() {
  return {
    device: $("#device").value.trim(),
    usable: $("#usable").value.trim(),
    labVersion: LAB_VERSION,
    keyboardApp: $("#kbdApp").value.trim(),
    prediction: $("#prediction").checked,
    savedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    results: st.results,
  };
}

async function save() {
  const p = payload();
  if (!p.device) { $("#saveMsg").textContent = "먼저 맨 위에 기기/브라우저를 적어 주세요."; return; }
  const body = JSON.stringify(p);
  try {
    const r = await fetch("/trace", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    $("#saveMsg").textContent = "저장됨: " + j.file;
  } catch (err) {
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ime-trace-" + p.device.replace(/[^\w가-힣]+/g, "_") + ".json";
    a.click();
    $("#saveMsg").textContent = "서버 저장 실패(" + err.message + "), 파일로 받았습니다.";
  }
}

/* ------------------------------------------------------------------ wire up */
const cb = $("#caseButtons");
CASES.forEach((c) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = `${c.id} ${c.label}`;
  b.addEventListener("click", () => startCase(c));
  cb.appendChild(b);
});
$("#done").addEventListener("pointerdown", () => { st.suppressBlur = true; });
$("#done").addEventListener("click", finishCase);
$("#reset").addEventListener("click", () => st.caseDef && startCase(st.caseDef));
$("#vpass").addEventListener("click", () => recordVerdict("pass"));
$("#vfail").addEventListener("click", () => recordVerdict("fail"));
$("#save").addEventListener("click", save);
$("#clear").addEventListener("click", () => { st.results = []; renderResults(); });
$("#showProxy").addEventListener("change", () => proxy && proxy.classList.toggle("visible", $("#showProxy").checked));
document.querySelectorAll("input[name=approach], #sentinel").forEach((el) =>
  el.addEventListener("change", () => st.caseDef && startCase(st.caseDef)),
);
$("#pasteSrc").addEventListener("focus", (e) => e.target.select());
