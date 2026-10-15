
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "account_batches": {
                  Row: {
                    "actor_id": string,"commit_token_hash": string,"completed_at": string | null,"created_at": string,"expires_at": string,"failed_rows": number,"id": string,"rows_hash": string,"school_id": string,"status": Database["public"]['Enums']["account_batch_status"],"succeeded_rows": number,"total_rows": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"commit_token_hash": string,"completed_at"?: string | null,"created_at"?: string,"expires_at": string,"failed_rows"?: number,"id"?: string,"rows_hash": string,"school_id": string,"status"?: Database["public"]['Enums']["account_batch_status"],"succeeded_rows"?: number,"total_rows": number
                  }
                  Update: {
                    "actor_id"?: string,"commit_token_hash"?: string,"completed_at"?: string | null,"created_at"?: string,"expires_at"?: string,"failed_rows"?: number,"id"?: string,"rows_hash"?: string,"school_id"?: string,"status"?: Database["public"]['Enums']["account_batch_status"],"succeeded_rows"?: number,"total_rows"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "account_batches_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": Database["public"]['Enums']["audit_action"],"actor_id": string | null,"classroom_id": string | null,"created_at": string,"id": string,"metadata": Json | null,"resource_id": string | null,"resource_type": Database["public"]['Enums']["audit_resource"]
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["audit_action"],"actor_id"?: string | null,"classroom_id"?: string | null,"created_at"?: string,"id"?: string,"metadata"?: Json | null,"resource_id"?: string | null,"resource_type": Database["public"]['Enums']["audit_resource"]
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["audit_action"],"actor_id"?: string | null,"classroom_id"?: string | null,"created_at"?: string,"id"?: string,"metadata"?: Json | null,"resource_id"?: string | null,"resource_type"?: Database["public"]['Enums']["audit_resource"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string,"role": Database["public"]['Enums']["user_role"],"school_id": string,"status": Database["public"]['Enums']["profile_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string,"role": Database["public"]['Enums']["user_role"],"school_id": string,"status"?: Database["public"]['Enums']["profile_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string,"role"?: Database["public"]['Enums']["user_role"],"school_id"?: string,"status"?: Database["public"]['Enums']["profile_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"student_accounts": {
                  Row: {
                    "created_at": string,"failed_attempts": number,"id": string,"locked_until": string | null,"must_change_password": boolean,"student_id": string,"synthetic_email": string,"username": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"failed_attempts"?: number,"id"?: string,"locked_until"?: string | null,"must_change_password"?: boolean,"student_id": string,"synthetic_email": string,"username": string
                  }
                  Update: {
                    "created_at"?: string,"failed_attempts"?: number,"id"?: string,"locked_until"?: string | null,"must_change_password"?: boolean,"student_id"?: string,"synthetic_email"?: string,"username"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_accounts_student_id_fkey"
      columns: ["student_id"]
isOneToOne: true
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"students": {
                  Row: {
                    "created_at": string,"grade": string,"id": string,"profile_id": string,"school_id": string,"student_no": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"grade": string,"id"?: string,"profile_id": string,"school_id": string,"student_no": string
                  }
                  Update: {
                    "created_at"?: string,"grade"?: string,"id"?: string,"profile_id"?: string,"school_id"?: string,"student_no"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "students_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "account_batch_status": "previewed"|"running"|"completed"|"expired","audit_action": "student.provisioned"|"student.batch_started"|"student.batch_completed"|"classroom.created"|"classroom.updated"|"classroom.archived"|"classroom.unarchived"|"classroom.co_teacher_added"|"classroom.co_teacher_removed"|"enrollment.added"|"enrollment.removed"|"enrollment.reactivated"|"enrollment.transferred","audit_resource": "profile"|"student"|"account"|"batch"|"classroom"|"classroom_teacher"|"enrollment","profile_status": "active"|"suspended","user_role": "teacher"|"student"|"admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "account_batch_status": ["previewed", "running", "completed", "expired"],"audit_action": ["student.provisioned", "student.batch_started", "student.batch_completed", "classroom.created", "classroom.updated", "classroom.archived", "classroom.unarchived", "classroom.co_teacher_added", "classroom.co_teacher_removed", "enrollment.added", "enrollment.removed", "enrollment.reactivated", "enrollment.transferred"],"audit_resource": ["profile", "student", "account", "batch", "classroom", "classroom_teacher", "enrollment"],"profile_status": ["active", "suspended"],"user_role": ["teacher", "student", "admin"]
          }
        }
} as const
