import { playRoute } from "@/features/crossword/play/api-guard";
import { helpBodySchema } from "@/features/crossword/play/schemas";
import { callTeacher } from "@/features/crossword/play/service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ assignmentId: string }> };

/** "선생님 부르기" (team mode). The body is an empty object: nothing about the student or the puzzle is sent. */
export async function POST(request: Request, context: Context) {
  return playRoute(request, context, { method: "POST", body: helpBodySchema, team: true }, ({ studentId, assignmentId }) =>
    callTeacher(studentId, assignmentId),
  );
}
