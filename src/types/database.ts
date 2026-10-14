// PLACEHOLDER: replace by running `pnpm db:types` after `supabase db reset`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          school_id: string;
          role: "teacher" | "student" | "admin";
          display_name: string;
          status: "active" | "suspended";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          school_id: string;
          role: "teacher" | "student" | "admin";
          display_name: string;
          status?: "active" | "suspended";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          role?: "teacher" | "student" | "admin";
          display_name?: string;
          status?: "active" | "suspended";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      students: {
        Row: {
          id: string;
          school_id: string;
          profile_id: string;
          student_no: string;
          grade: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          profile_id: string;
          student_no: string;
          grade: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          profile_id?: string;
          student_no?: string;
          grade?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      student_accounts: {
        Row: {
          id: string;
          student_id: string;
          username: string;
          synthetic_email: string;
          must_change_password: boolean;
          failed_attempts: number;
          locked_until: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          username: string;
          synthetic_email: string;
          must_change_password?: boolean;
          failed_attempts?: number;
          locked_until?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          username?: string;
          synthetic_email?: string;
          must_change_password?: boolean;
          failed_attempts?: number;
          locked_until?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          classroom_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          classroom_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          resource_type?: string;
          resource_id?: string | null;
          classroom_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
