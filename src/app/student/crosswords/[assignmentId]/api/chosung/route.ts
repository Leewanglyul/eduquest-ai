import { playRoute } from "@/features/crossword/play/api-guard";
import { chosungBodySchema } from "@/features/crossword/play/schemas";
import { chosung } from "@/features/crossword/play/service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ assignmentId: string }> };

export async function POST(request: Request, context: Context) {
  return playRoute(request, context, { method: "POST", body: chosungBodySchema }, ({ studentId, assignmentId, body }) =>
    chosung(studentId, assignmentId, body),
  );
}
