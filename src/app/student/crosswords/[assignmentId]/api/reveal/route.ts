import { playRoute } from "@/features/crossword/play/api-guard";
import { revealBodySchema } from "@/features/crossword/play/schemas";
import { reveal } from "@/features/crossword/play/service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ assignmentId: string }> };

export async function POST(request: Request, context: Context) {
  return playRoute(request, context, { method: "POST", body: revealBodySchema }, ({ studentId, assignmentId, body }) =>
    reveal(studentId, assignmentId, body),
  );
}
