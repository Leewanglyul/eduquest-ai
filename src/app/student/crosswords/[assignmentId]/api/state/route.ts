import { playRoute } from "@/features/crossword/play/api-guard";
import { getPlayState } from "@/features/crossword/play/service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ assignmentId: string }> };

export async function GET(request: Request, context: Context) {
  return playRoute(request, context, { method: "GET" }, ({ studentId, assignmentId }) => getPlayState(studentId, assignmentId));
}
