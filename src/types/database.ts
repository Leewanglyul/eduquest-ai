
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
                },"classroom_enrollments": {
                  Row: {
                    "classroom_id": string,"enrolled_at": string,"id": string,"removed_at": string | null,"status": Database["public"]['Enums']["enrollment_status"],"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "classroom_id": string,"enrolled_at"?: string,"id"?: string,"removed_at"?: string | null,"status"?: Database["public"]['Enums']["enrollment_status"],"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "classroom_id"?: string,"enrolled_at"?: string,"id"?: string,"removed_at"?: string | null,"status"?: Database["public"]['Enums']["enrollment_status"],"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "classroom_enrollments_classroom_id_fkey"
      columns: ["classroom_id"]
isOneToOne: false
      referencedRelation: "classrooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "classroom_enrollments_classroom_id_fkey"
      columns: ["classroom_id"]
isOneToOne: false
      referencedRelation: "v_classroom_activity_safe"
      referencedColumns: ["classroom_id"]
    },{
      foreignKeyName: "classroom_enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "classroom_enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "v_students_safe"
      referencedColumns: ["id"]
    }
                  ]
                },"classroom_teachers": {
                  Row: {
                    "added_by": string | null,"classroom_id": string,"created_at": string,"teacher_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"classroom_id": string,"created_at"?: string,"teacher_id": string
                  }
                  Update: {
                    "added_by"?: string | null,"classroom_id"?: string,"created_at"?: string,"teacher_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "classroom_teachers_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "classroom_teachers_classroom_id_fkey"
      columns: ["classroom_id"]
isOneToOne: false
      referencedRelation: "classrooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "classroom_teachers_classroom_id_fkey"
      columns: ["classroom_id"]
isOneToOne: false
      referencedRelation: "v_classroom_activity_safe"
      referencedColumns: ["classroom_id"]
    },{
      foreignKeyName: "classroom_teachers_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"classrooms": {
                  Row: {
                    "archived_at": string | null,"code": string,"created_at": string,"id": string,"name": string,"owner_id": string,"school_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"code"?: string,"created_at"?: string,"id"?: string,"name": string,"owner_id": string,"school_id": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"code"?: string,"created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string,"school_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "classrooms_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"content_entries": {
                  Row: {
                    "answer": string,"answer_length": number | null,"archived_at": string | null,"archived_batch_id": string | null,"created_at": string,"definition": string,"id": string,"import_batch_id": string | null,"normalizer_version": number,"position": number,"script": Database["public"]['Enums']["content_script"],"set_id": string,"source_line": number | null,"term": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer": string,"answer_length"?: never,"archived_at"?: string | null,"archived_batch_id"?: string | null,"created_at"?: string,"definition": string,"id"?: string,"import_batch_id"?: string | null,"normalizer_version": number,"position": number,"script": Database["public"]['Enums']["content_script"],"set_id": string,"source_line"?: number | null,"term": string
                  }
                  Update: {
                    "answer"?: string,"answer_length"?: never,"archived_at"?: string | null,"archived_batch_id"?: string | null,"created_at"?: string,"definition"?: string,"id"?: string,"import_batch_id"?: string | null,"normalizer_version"?: number,"position"?: number,"script"?: Database["public"]['Enums']["content_script"],"set_id"?: string,"source_line"?: number | null,"term"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_entries_archived_batch_id_fkey"
      columns: ["archived_batch_id"]
isOneToOne: false
      referencedRelation: "content_import_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_entries_import_batch_id_fkey"
      columns: ["import_batch_id"]
isOneToOne: false
      referencedRelation: "content_import_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_entries_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "content_sets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_entries_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "v_content_sets_summary"
      referencedColumns: ["set_id"]
    }
                  ]
                },"content_import_batches": {
                  Row: {
                    "accepted_rows": number,"actor_id": string,"archived_rows": number,"commit_token_hash": string,"completed_at": string | null,"created_at": string,"expires_at": string,"id": string,"mode": Database["public"]['Enums']["content_import_mode"],"rows_hash": string,"school_id": string,"set_id": string | null,"skipped_rows": number,"source_bytes": number,"source_sha256": string,"status": Database["public"]['Enums']["content_import_status"],"total_rows": number
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_rows"?: number,"actor_id": string,"archived_rows"?: number,"commit_token_hash": string,"completed_at"?: string | null,"created_at"?: string,"expires_at": string,"id"?: string,"mode": Database["public"]['Enums']["content_import_mode"],"rows_hash": string,"school_id": string,"set_id"?: string | null,"skipped_rows"?: number,"source_bytes": number,"source_sha256": string,"status"?: Database["public"]['Enums']["content_import_status"],"total_rows": number
                  }
                  Update: {
                    "accepted_rows"?: number,"actor_id"?: string,"archived_rows"?: number,"commit_token_hash"?: string,"completed_at"?: string | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"mode"?: Database["public"]['Enums']["content_import_mode"],"rows_hash"?: string,"school_id"?: string,"set_id"?: string | null,"skipped_rows"?: number,"source_bytes"?: number,"source_sha256"?: string,"status"?: Database["public"]['Enums']["content_import_status"],"total_rows"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_import_batches_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_import_batches_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "content_sets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_import_batches_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "v_content_sets_summary"
      referencedColumns: ["set_id"]
    }
                  ]
                },"content_sets": {
                  Row: {
                    "archived_at": string | null,"classroom_id": string | null,"created_at": string,"id": string,"owner_id": string,"school_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"classroom_id"?: string | null,"created_at"?: string,"id"?: string,"owner_id": string,"school_id": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"classroom_id"?: string | null,"created_at"?: string,"id"?: string,"owner_id"?: string,"school_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_sets_classroom_id_fkey"
      columns: ["classroom_id"]
isOneToOne: false
      referencedRelation: "classrooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_sets_classroom_id_fkey"
      columns: ["classroom_id"]
isOneToOne: false
      referencedRelation: "v_classroom_activity_safe"
      referencedColumns: ["classroom_id"]
    },{
      foreignKeyName: "content_sets_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"crossword_assignments": {
                  Row: {
                    "classroom_id": string,"closed_at": string | null,"closes_at": string | null,"created_at": string,"created_by": string | null,"id": string,"opens_at": string | null,"puzzle_id": string,"status": Database["public"]['Enums']["crossword_assignment_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "classroom_id": string,"closed_at"?: string | null,"closes_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"opens_at"?: string | null,"puzzle_id": string,"status"?: Database["public"]['Enums']["crossword_assignment_status"]
                  }
                  Update: {
                    "classroom_id"?: string,"closed_at"?: string | null,"closes_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"opens_at"?: string | null,"puzzle_id"?: string,"status"?: Database["public"]['Enums']["crossword_assignment_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "crossword_assignments_classroom_id_fkey"
      columns: ["classroom_id"]
isOneToOne: false
      referencedRelation: "classrooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_assignments_classroom_id_fkey"
      columns: ["classroom_id"]
isOneToOne: false
      referencedRelation: "v_classroom_activity_safe"
      referencedColumns: ["classroom_id"]
    },{
      foreignKeyName: "crossword_assignments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_assignments_puzzle_id_fkey"
      columns: ["puzzle_id"]
isOneToOne: false
      referencedRelation: "crossword_puzzles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_assignments_puzzle_id_fkey"
      columns: ["puzzle_id"]
isOneToOne: false
      referencedRelation: "v_crossword_puzzles_summary"
      referencedColumns: ["puzzle_id"]
    }
                  ]
                },"crossword_preview_tickets": {
                  Row: {
                    "actor_id": string,"created_at": string,"expires_at": string,"id": string,"placement_hash": string,"school_id": string,"set_id": string | null,"token_hash": string,"used_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"created_at"?: string,"expires_at": string,"id"?: string,"placement_hash": string,"school_id": string,"set_id"?: string | null,"token_hash": string,"used_at"?: string | null
                  }
                  Update: {
                    "actor_id"?: string,"created_at"?: string,"expires_at"?: string,"id"?: string,"placement_hash"?: string,"school_id"?: string,"set_id"?: string | null,"token_hash"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "crossword_preview_tickets_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_preview_tickets_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "content_sets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_preview_tickets_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "v_content_sets_summary"
      referencedColumns: ["set_id"]
    }
                  ]
                },"crossword_puzzles": {
                  Row: {
                    "archived_at": string | null,"cols": number,"created_at": string,"generator_version": number,"id": string,"level": Database["public"]['Enums']["crossword_level"],"owner_id": string,"placement_hash": string,"published_at": string | null,"root_id": string,"rows": number,"school_id": string,"seed": number,"set_id": string | null,"settings": NonNullable<Json>,"stats": NonNullable<Json>,"status": Database["public"]['Enums']["crossword_status"],"supersedes_id": string | null,"title": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"cols": number,"created_at"?: string,"generator_version": number,"id"?: string,"level": Database["public"]['Enums']["crossword_level"],"owner_id": string,"placement_hash": string,"published_at"?: string | null,"root_id": string,"rows": number,"school_id": string,"seed": number,"set_id"?: string | null,"settings": NonNullable<Json>,"stats": NonNullable<Json>,"status"?: Database["public"]['Enums']["crossword_status"],"supersedes_id"?: string | null,"title": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"cols"?: number,"created_at"?: string,"generator_version"?: number,"id"?: string,"level"?: Database["public"]['Enums']["crossword_level"],"owner_id"?: string,"placement_hash"?: string,"published_at"?: string | null,"root_id"?: string,"rows"?: number,"school_id"?: string,"seed"?: number,"set_id"?: string | null,"settings"?: NonNullable<Json>,"stats"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["crossword_status"],"supersedes_id"?: string | null,"title"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "crossword_puzzles_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_puzzles_root_id_fkey"
      columns: ["root_id"]
isOneToOne: false
      referencedRelation: "crossword_puzzles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_puzzles_root_id_fkey"
      columns: ["root_id"]
isOneToOne: false
      referencedRelation: "v_crossword_puzzles_summary"
      referencedColumns: ["puzzle_id"]
    },{
      foreignKeyName: "crossword_puzzles_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "content_sets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_puzzles_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "v_content_sets_summary"
      referencedColumns: ["set_id"]
    },{
      foreignKeyName: "crossword_puzzles_supersedes_id_fkey"
      columns: ["supersedes_id"]
isOneToOne: false
      referencedRelation: "crossword_puzzles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_puzzles_supersedes_id_fkey"
      columns: ["supersedes_id"]
isOneToOne: false
      referencedRelation: "v_crossword_puzzles_summary"
      referencedColumns: ["puzzle_id"]
    }
                  ]
                },"crossword_words": {
                  Row: {
                    "answer": string,"clue": string,"col": number,"direction": Database["public"]['Enums']["crossword_direction"],"id": string,"length": number | null,"number": number,"puzzle_id": string,"row": number,"single": boolean | null,"source_entry_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "answer": string,"clue": string,"col": number,"direction": Database["public"]['Enums']["crossword_direction"],"id"?: string,"length"?: never,"number": number,"puzzle_id": string,"row": number,"single"?: never,"source_entry_id"?: string | null
                  }
                  Update: {
                    "answer"?: string,"clue"?: string,"col"?: number,"direction"?: Database["public"]['Enums']["crossword_direction"],"id"?: string,"length"?: never,"number"?: number,"puzzle_id"?: string,"row"?: number,"single"?: never,"source_entry_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "crossword_words_puzzle_id_fkey"
      columns: ["puzzle_id"]
isOneToOne: false
      referencedRelation: "crossword_puzzles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_words_puzzle_id_fkey"
      columns: ["puzzle_id"]
isOneToOne: false
      referencedRelation: "v_crossword_puzzles_summary"
      referencedColumns: ["puzzle_id"]
    },{
      foreignKeyName: "crossword_words_source_entry_id_fkey"
      columns: ["source_entry_id"]
isOneToOne: false
      referencedRelation: "content_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_words_source_entry_id_fkey"
      columns: ["source_entry_id"]
isOneToOne: false
      referencedRelation: "v_content_entries_active"
      referencedColumns: ["entry_id"]
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
    },{
      foreignKeyName: "student_accounts_student_id_fkey"
      columns: ["student_id"]
isOneToOne: true
      referencedRelation: "v_students_safe"
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
            "v_classroom_activity_safe": {
                  Row: {
                    "active_student_count": number | null,"archived_at": string | null,"classroom_id": string | null,"co_teacher_count": number | null,"last_activity_at": string | null,"name": string | null,"school_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "active_student_count"?: never,"archived_at"?: string | null,"classroom_id"?: string | null,"co_teacher_count"?: never,"last_activity_at"?: never,"name"?: string | null,"school_id"?: string | null
                         }
                        Update: {
                           "active_student_count"?: never,"archived_at"?: string | null,"classroom_id"?: string | null,"co_teacher_count"?: never,"last_activity_at"?: never,"name"?: string | null,"school_id"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"v_content_entries_active": {
                  Row: {
                    "answer": string | null,"answer_length": number | null,"definition": string | null,"entry_id": string | null,"position": number | null,"script": Database["public"]['Enums']["content_script"] | null,"set_id": string | null,"term": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "content_entries_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "content_sets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_entries_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "v_content_sets_summary"
      referencedColumns: ["set_id"]
    }
                  ]
                },"v_content_sets_summary": {
                  Row: {
                    "archived_at": string | null,"classroom_id": string | null,"entry_count": number | null,"max_answer_length": number | null,"min_answer_length": number | null,"owner_id": string | null,"school_id": string | null,"set_id": string | null,"title": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "content_sets_classroom_id_fkey"
      columns: ["classroom_id"]
isOneToOne: false
      referencedRelation: "classrooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_sets_classroom_id_fkey"
      columns: ["classroom_id"]
isOneToOne: false
      referencedRelation: "v_classroom_activity_safe"
      referencedColumns: ["classroom_id"]
    },{
      foreignKeyName: "content_sets_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"v_crossword_puzzles_summary": {
                  Row: {
                    "archived_at": string | null,"cols": number | null,"has_live_successor": boolean | null,"level": Database["public"]['Enums']["crossword_level"] | null,"open_assignments": number | null,"owner_id": string | null,"published_at": string | null,"puzzle_id": string | null,"root_id": string | null,"rows": number | null,"school_id": string | null,"set_id": string | null,"status": Database["public"]['Enums']["crossword_status"] | null,"supersedes_id": string | null,"title": string | null,"updated_at": string | null,"version": number | null,"word_count": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "archived_at"?: string | null,"cols"?: number | null,"has_live_successor"?: never,"level"?: Database["public"]['Enums']["crossword_level"] | null,"open_assignments"?: never,"owner_id"?: string | null,"published_at"?: string | null,"puzzle_id"?: string | null,"root_id"?: string | null,"rows"?: number | null,"school_id"?: string | null,"set_id"?: string | null,"status"?: Database["public"]['Enums']["crossword_status"] | null,"supersedes_id"?: string | null,"title"?: string | null,"updated_at"?: string | null,"version"?: number | null,"word_count"?: never
                         }
                        Update: {
                           "archived_at"?: string | null,"cols"?: number | null,"has_live_successor"?: never,"level"?: Database["public"]['Enums']["crossword_level"] | null,"open_assignments"?: never,"owner_id"?: string | null,"published_at"?: string | null,"puzzle_id"?: string | null,"root_id"?: string | null,"rows"?: number | null,"school_id"?: string | null,"set_id"?: string | null,"status"?: Database["public"]['Enums']["crossword_status"] | null,"supersedes_id"?: string | null,"title"?: string | null,"updated_at"?: string | null,"version"?: number | null,"word_count"?: never
                         }
                        Relationships: [
                    {
      foreignKeyName: "crossword_puzzles_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_puzzles_root_id_fkey"
      columns: ["root_id"]
isOneToOne: false
      referencedRelation: "crossword_puzzles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_puzzles_root_id_fkey"
      columns: ["root_id"]
isOneToOne: false
      referencedRelation: "v_crossword_puzzles_summary"
      referencedColumns: ["puzzle_id"]
    },{
      foreignKeyName: "crossword_puzzles_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "content_sets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_puzzles_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "v_content_sets_summary"
      referencedColumns: ["set_id"]
    },{
      foreignKeyName: "crossword_puzzles_supersedes_id_fkey"
      columns: ["supersedes_id"]
isOneToOne: false
      referencedRelation: "crossword_puzzles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crossword_puzzles_supersedes_id_fkey"
      columns: ["supersedes_id"]
isOneToOne: false
      referencedRelation: "v_crossword_puzzles_summary"
      referencedColumns: ["puzzle_id"]
    }
                  ]
                },"v_students_safe": {
                  Row: {
                    "created_at": string | null,"display_name": string | null,"grade": string | null,"id": string | null,"profile_status": Database["public"]['Enums']["profile_status"] | null,"school_id": string | null,"student_no": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "fn_add_crossword_assignments":
{ Args: { "p_actor_id": string,"p_classroom_ids": (string)[],"p_closes_at": string,"p_opens_at": string,"p_puzzle_id": string,"p_school_id": string }; Returns: Json
                           },
"fn_cleanup_content_import_batches":
{ Args: { "p_grace"?: string }; Returns: number
                           },
"fn_cleanup_crossword_tickets":
{ Args: { "p_grace"?: string }; Returns: number
                           },
"fn_close_crossword_assignment":
{ Args: { "p_actor_id": string,"p_assignment_id": string,"p_school_id": string }; Returns: Json
                           },
"fn_commit_content_import":
{ Args: { "p_actor_id": string,"p_batch_id": string,"p_classroom_id": string,"p_max_entries": number,"p_mode": Database["public"]['Enums']["content_import_mode"],"p_new_title": string,"p_rows": Json,"p_rows_hash": string,"p_school_id": string,"p_set_id": string,"p_token_hash": string }; Returns: Json
                           },
"fn_content_rows_hash":
{ Args: { "p_classroom_id": string,"p_mode": Database["public"]['Enums']["content_import_mode"],"p_new_title": string,"p_rows": Json,"p_set_id": string }; Returns: string
                           },
"fn_create_crossword_version":
{ Args: { "p_actor_id": string,"p_school_id": string,"p_source_id": string }; Returns: Json
                           },
"fn_crossword_actor_manages":
{ Args: { "p_actor_id": string,"p_puzzle_id": string,"p_role": Database["public"]['Enums']["user_role"] }; Returns: boolean
                           },
"fn_crossword_actor_role":
{ Args: { "p_actor_id": string,"p_school_id": string }; Returns: Database["public"]['Enums']["user_role"]
                           },
"fn_crossword_cells":
{ Args: { "p_words": Json }; Returns: {
              "c": number,"ch": string,"dir": string,"idx": number,"r": number,"single": boolean
            }[]
                           },
"fn_crossword_check_classrooms":
{ Args: { "p_actor_id": string,"p_classroom_ids": (string)[],"p_role": Database["public"]['Enums']["user_role"],"p_school_id": string }; Returns: (string)[]
                           },
"fn_crossword_expand":
{ Args: { "p_words": Json }; Returns: {
              "ans": string,"c": number,"dir": string,"idx": number,"len": number,"num": number,"r": number,"single": boolean
            }[]
                           },
"fn_crossword_min_words":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"fn_crossword_placement_hash":
{ Args: { "p_cols": number,"p_generator_version": number,"p_rows": number,"p_words": Json }; Returns: string
                           },
"fn_crossword_validate_words":
{ Args: { "p_cols": number,"p_rows": number,"p_words": Json }; Returns: string
                           },
"fn_crossword_words_json":
{ Args: { "p_puzzle_id": string }; Returns: Json
                           },
"fn_generate_classroom_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"fn_is_crossword_owner":
{ Args: { "p_puzzle_id": string }; Returns: boolean
                           },
"fn_publish_crossword":
{ Args: { "p_actor_id": string,"p_classroom_ids": (string)[],"p_closes_at": string,"p_opens_at": string,"p_puzzle_id": string,"p_school_id": string }; Returns: Json
                           },
"fn_revoke_user_sessions":
{ Args: { "p_user_id": string }; Returns: number
                           },
"fn_save_crossword":
{ Args: { "p_actor_id": string,"p_cols": number,"p_generator_version": number,"p_level": Database["public"]['Enums']["crossword_level"],"p_max_singles": number,"p_max_words": number,"p_placement_hash": string,"p_puzzle_id"?: string,"p_rows": number,"p_school_id": string,"p_seed": number,"p_set_id": string,"p_settings": Json,"p_stats": Json,"p_ticket_id": string,"p_title": string,"p_token_hash": string,"p_words": Json }; Returns: Json
                           },
"fn_set_crossword_archived":
{ Args: { "p_actor_id": string,"p_archive": boolean,"p_puzzle_id": string,"p_school_id": string }; Returns: Json
                           },
"fn_student_login_begin":
{ Args: { "p_account_id": string,"p_limit": number }; Returns: {
              "allowed": boolean,"locked_until": string
            }[]
                           },
"fn_student_login_fail":
{ Args: { "p_account_id": string,"p_limit": number,"p_lock_minutes": number }; Returns: {
              "locked": boolean,"locked_until": string
            }[]
                           },
"fn_student_login_release":
{ Args: { "p_account_id": string }; Returns: undefined
                           },
"fn_transfer_enrollment":
{ Args: { "actor_id": string,"source_classroom_id": string,"student_id": string,"target_classroom_id": string }; Returns: string
                           },
"fn_update_crossword_draft":
{ Args: { "p_actor_id": string,"p_clues": Json,"p_puzzle_id": string,"p_school_id": string,"p_title": string }; Returns: Json
                           }
          }
          Enums: {
            "account_batch_status": "previewed"|"running"|"completed"|"expired","audit_action": "student.provisioned"|"student.batch_started"|"student.batch_completed"|"classroom.created"|"classroom.updated"|"classroom.archived"|"classroom.unarchived"|"classroom.co_teacher_added"|"classroom.co_teacher_removed"|"enrollment.added"|"enrollment.removed"|"enrollment.reactivated"|"enrollment.transferred"|"student.password_reissued"|"content_set.created"|"content_set.updated"|"content_set.archived"|"content_set.unarchived"|"content_set.import_completed"|"content_set.import_rejected"|"content_set.exported"|"content_entry.updated"|"content_entry.archived"|"crossword.created"|"crossword.updated"|"crossword.published"|"crossword.assignment_closed"|"crossword.archived"|"crossword.unarchived"|"crossword.copied"|"crossword.assigned","audit_resource": "profile"|"student"|"account"|"batch"|"classroom"|"classroom_teacher"|"enrollment"|"content_set"|"crossword","content_import_mode": "create"|"append"|"replace","content_import_status": "previewed"|"completed"|"expired","content_script": "hangul"|"latin"|"digit"|"mixed","crossword_assignment_status": "open"|"closed","crossword_direction": "across"|"down","crossword_level": "easy"|"normal"|"hard","crossword_status": "draft"|"published"|"archived","enrollment_status": "active"|"removed","profile_status": "active"|"suspended","user_role": "teacher"|"student"|"admin"
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
            "account_batch_status": ["previewed", "running", "completed", "expired"],"audit_action": ["student.provisioned", "student.batch_started", "student.batch_completed", "classroom.created", "classroom.updated", "classroom.archived", "classroom.unarchived", "classroom.co_teacher_added", "classroom.co_teacher_removed", "enrollment.added", "enrollment.removed", "enrollment.reactivated", "enrollment.transferred", "student.password_reissued", "content_set.created", "content_set.updated", "content_set.archived", "content_set.unarchived", "content_set.import_completed", "content_set.import_rejected", "content_set.exported", "content_entry.updated", "content_entry.archived", "crossword.created", "crossword.updated", "crossword.published", "crossword.assignment_closed", "crossword.archived", "crossword.unarchived", "crossword.copied", "crossword.assigned"],"audit_resource": ["profile", "student", "account", "batch", "classroom", "classroom_teacher", "enrollment", "content_set", "crossword"],"content_import_mode": ["create", "append", "replace"],"content_import_status": ["previewed", "completed", "expired"],"content_script": ["hangul", "latin", "digit", "mixed"],"crossword_assignment_status": ["open", "closed"],"crossword_direction": ["across", "down"],"crossword_level": ["easy", "normal", "hard"],"crossword_status": ["draft", "published", "archived"],"enrollment_status": ["active", "removed"],"profile_status": ["active", "suspended"],"user_role": ["teacher", "student", "admin"]
          }
        }
} as const
