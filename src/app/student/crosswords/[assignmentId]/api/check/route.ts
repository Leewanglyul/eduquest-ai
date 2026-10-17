import { playRoute } from "@/features/crossword/play/api-guard";
import { checkBodySchema } from "@/features/crossword/play/schemas";
import { checkCells } from "@/features/crossword/play/service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ assignmentId: string }> };

export async function POST(request: Request, context: Context) {
  return playRoute(request, context, { method: "POST", body: checkBodySchema }, ({ studentId, assignmentId, body }) =>
    checkCells(studentId, assignmentId, body),
  );
}
