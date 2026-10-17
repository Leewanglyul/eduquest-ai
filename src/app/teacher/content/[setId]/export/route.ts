import { requireTeacherArea } from "@/lib/rbac/guards";
import { IdentityError } from "@/features/identity/errors";
import { contentDisposition } from "@/features/content/export/export-csv";
import { exportContentSet } from "@/features/content/export/export-service";
import { ContentImportError } from "@/features/content/import/import-errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ setId: string }> };

const text = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });

/** Downloads a word set as CSV. A download needs a real response with headers, so this is a route, not a server action. */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const actor = await requireTeacherArea();
    const { setId } = await params;
    const file = await exportContentSet(actor, setId);
    return new Response(file.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition(file.fileName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    // Not signed in or not a teacher: 401/403 without detail. Not visible to this teacher: the same as missing.
    if (error instanceof IdentityError) return text(error.code === "UNAUTHENTICATED" ? 401 : 403, error.message);
    if (error instanceof ContentImportError) return text(error.code === "SET_NOT_FOUND" ? 404 : 400, error.message);
    throw error;
  }
}
