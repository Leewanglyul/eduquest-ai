import { playRoute } from "@/features/crossword/play/api-guard";
import { PlayError } from "@/features/crossword/play/errors";
import { getTeamState } from "@/features/crossword/play/service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ assignmentId: string }> };

/** `known` is the revision the browser holds: a non-negative integer, or absent for "send me everything". */
function knownRevision(url: URL): number | null {
  const raw = url.searchParams.get("known");
  if (raw === null) return null;
  if (!/^\d{1,15}$/.test(raw)) throw new PlayError("BAD_PATCH");
  return Number(raw);
}

export async function GET(request: Request, context: Context) {
  return playRoute(request, context, { method: "GET", team: true }, ({ studentId, assignmentId, url }) =>
    getTeamState(studentId, assignmentId, knownRevision(url)),
  );
}
