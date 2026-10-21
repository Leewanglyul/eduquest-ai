import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COPY_FAILED_TEXT, CredentialCard } from "@/components/teacher/credential-card";
import { copyText } from "@/lib/copy-text";

// M1-BUG-01: the copy button of the new-student card did nothing on a plain-HTTP address, where navigator.clipboard does
// not exist. copyText must never throw, must fall back to the selection copy, and must never log the text (a password).

const SECRET = "Tmp#Secret-9x";

function fakeBrowser(opts: { secure: boolean; clipboard?: "ok" | "reject" | "missing"; exec?: boolean | "throw" }) {
  const writes: string[] = [];
  const appended: { value: string; removed: boolean }[] = [];
  const area = () => {
    const el = {
      value: "",
      style: {} as Record<string, string>,
      setAttribute: () => undefined,
      focus: () => undefined,
      select: () => undefined,
      setSelectionRange: () => undefined,
      remove() {
        rec.removed = true;
      },
    };
    const rec = { get value() { return el.value; }, removed: false };
    appended.push(rec);
    return el;
  };
  const button = { focus: vi.fn() };
  vi.stubGlobal("window", { isSecureContext: opts.secure });
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("navigator", {
    clipboard:
      opts.clipboard === "missing" || opts.clipboard === undefined
        ? undefined
        : { writeText: async (t: string) => (opts.clipboard === "reject" ? Promise.reject(new Error("denied")) : void writes.push(t)) },
  });
  Object.setPrototypeOf(button, (globalThis as unknown as { HTMLElement: { prototype: object } }).HTMLElement.prototype);
  vi.stubGlobal("document", {
    activeElement: button,
    body: { appendChild: () => undefined },
    createElement: area,
    execCommand: () => {
      if (opts.exec === "throw") throw new Error("blocked");
      return opts.exec ?? false;
    },
  });
  return { writes, appended, button };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("copyText", () => {
  it("HTTPS: uses the Clipboard API", async () => {
    const b = fakeBrowser({ secure: true, clipboard: "ok" });
    expect(await copyText(SECRET)).toBe(true);
    expect(b.writes).toEqual([SECRET]);
    expect(b.appended).toHaveLength(0);
  });

  it("plain HTTP (navigator.clipboard missing): falls back to the selection copy", async () => {
    const b = fakeBrowser({ secure: false, clipboard: "missing", exec: true });
    expect(await copyText(SECRET)).toBe(true);
    expect(b.appended).toHaveLength(1);
    expect(b.appended[0].value).toBe(SECRET);
    expect(b.appended[0].removed, "the helper element is removed").toBe(true);
    expect(b.button.focus, "focus goes back to the button").toHaveBeenCalled();
  });

  it("Clipboard API refused (permission): falls back and still succeeds", async () => {
    fakeBrowser({ secure: true, clipboard: "reject", exec: true });
    expect(await copyText(SECRET)).toBe(true);
  });

  it("nothing works: returns false and does not throw", async () => {
    const b = fakeBrowser({ secure: false, clipboard: "missing", exec: false });
    await expect(copyText(SECRET)).resolves.toBe(false);
    expect(b.appended[0].removed).toBe(true);
  });

  it("the fallback itself throws: returns false and cleans up", async () => {
    const b = fakeBrowser({ secure: false, clipboard: "missing", exec: "throw" });
    await expect(copyText(SECRET)).resolves.toBe(false);
    expect(b.appended[0].removed).toBe(true);
  });

  it("never writes the text to the console, on any path", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    for (const o of [
      { secure: true, clipboard: "ok" as const },
      { secure: true, clipboard: "reject" as const, exec: true },
      { secure: false, clipboard: "missing" as const, exec: false },
      { secure: false, clipboard: "missing" as const, exec: "throw" as const },
    ]) {
      fakeBrowser(o);
      await copyText(SECRET);
      vi.unstubAllGlobals();
    }
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it("outside a browser (no window or document) it returns false", async () => {
    await expect(copyText(SECRET)).resolves.toBe(false);
  });
});

describe("CredentialCard", () => {
  const html = renderToStaticMarkup(
    <CredentialCard credential={{ username: "u123", temporaryPassword: SECRET } as never} />,
  );

  it("shows the account, the one-time notice and the copy button; no failure message before a click", () => {
    expect(html).toContain("u123");
    expect(html).toContain(SECRET);
    expect(html).toContain("복사하기");
    expect(html).not.toContain(COPY_FAILED_TEXT);
  });

  it("the values can be selected in one tap (a manual copy stays possible when copying fails)", () => {
    expect(html.match(/select-all/g)?.length).toBe(2);
  });

  it("the failure text asks for a manual copy and does not contain the password", () => {
    expect(COPY_FAILED_TEXT).toMatch(/직접 선택해서 복사/);
    expect(COPY_FAILED_TEXT).not.toContain(SECRET);
  });
});

describe("source guards", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

  it("the card no longer calls navigator.clipboard directly and neither file logs", () => {
    const card = read("src/components/teacher/credential-card.tsx");
    const helper = read("src/lib/copy-text.ts");
    expect(card).not.toMatch(/navigator\.clipboard/);
    expect(card).toMatch(/copyText\(/);
    for (const src of [card, helper]) expect(src).not.toMatch(/console\./);
  });

  it("a failed copy is announced as an alert", () => {
    expect(read("src/components/teacher/credential-card.tsx")).toMatch(/role="alert"/);
  });
});
