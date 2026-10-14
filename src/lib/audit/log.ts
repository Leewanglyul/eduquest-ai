import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";

export type AuditResource =
  | "profile"
  | "student"
  | "account"
  | "batch"
  | "classroom"
  | "classroom_teacher"
  | "enrollment";

export type AuditAction =
  | "student.provisioned"
  | "student.batch_started"
  | "student.batch_completed"
  | "classroom.created"
  | "classroom.updated"
  | "classroom.archived"
  | "classroom.unarchived"
  | "classroom.co_teacher_added"
  | "classroom.co_teacher_removed"
  | "enrollment.added"
  | "enrollment.removed"
  | "enrollment.reactivated"
  | "enrollment.transferred";

export type AuditWrite = {
  actorId: string | null;
  action: AuditAction;
  resourceType: AuditResource;
  resourceId?: string | null;
  classroomId?: string | null;
  metadata?: Json | null;
};

export async function writeAuditLog(input: AuditWrite): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { error } = await admin.from("audit_logs").insert({
    actor_id: input.actorId,
    action: input.action,
    resource_type: input.resourceType,
    resource_id: input.resourceId ?? null,
    classroom_id: input.classroomId ?? null,
    metadata: input.metadata ?? null,
  } satisfies Database["public"]["Tables"]["audit_logs"]["Insert"]);

  if (error) {
    // Best-effort, non-blocking telemetry
    console.error("[audit] write failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }
}
