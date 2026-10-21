/**
 * Copy a piece of text to the clipboard from a click handler. Resolves to true when it worked and false when it did not;
 * it never throws and never logs the text (the text may be a temporary password).
 *
 * navigator.clipboard exists only in a secure context (HTTPS or localhost). On a plain-HTTP address such as a LAN test
 * run it is undefined, so the call must be guarded; the old selection-based copy (execCommand) still works there as long
 * as it runs inside the user's click.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof window !== "undefined" && window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // permission refused or the document was not focused: try the fallback below
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  const area = document.createElement("textarea");
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  try {
    area.value = text;
    area.setAttribute("readonly", "");
    area.setAttribute("aria-hidden", "true");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "-9999px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length); // iOS and some Android browsers ignore select() alone
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    previous?.focus(); // give the focus back to the button the teacher pressed
  }
}
