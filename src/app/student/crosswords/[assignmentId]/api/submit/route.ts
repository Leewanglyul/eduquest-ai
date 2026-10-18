import { playRoute } from "@/features/crossword/play/api-guard";
import { submitBodySchema } from "@/features/crossword/play/schemas";
import { submit } from "@/features/crossword/play/service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ assignmentId: string }> };

export async function POST(request: Request, context: Context) {
  return playRoute(request, context, { method: "POST", body: submitBodySchema }, ({ studentId, assignmentId, body }) =>
    submit(studentId, assignmentId, body.baseRevision),
  );
}
