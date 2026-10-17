import { playRoute } from "@/features/crossword/play/api-guard";
import { saveBodySchema } from "@/features/crossword/play/schemas";
import { savePatch } from "@/features/crossword/play/service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ assignmentId: string }> };

export async function POST(request: Request, context: Context) {
  return playRoute(request, context, { method: "POST", body: saveBodySchema }, ({ studentId, assignmentId, body }) =>
    savePatch(studentId, assignmentId, body.patch, body.activeMs),
  );
}
