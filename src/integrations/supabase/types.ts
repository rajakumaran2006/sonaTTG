export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      class_counselors: {
        Row: {
          batch: string | null
          created_at: string
          department_id: string
          faculty_id: string
          id: string
          is_active: boolean
          section: string
          updated_at: string
          year: string
        }
        Insert: {
          batch?: string | null
          created_at?: string
          department_id: string
          faculty_id: string
          id?: string
          is_active?: boolean
          section: string
          updated_at?: string
          year: string
        }
        Update: {
          batch?: string | null
          created_at?: string
          department_id?: string
          faculty_id?: string
          id?: string
          is_active?: boolean
          section?: string
          updated_at?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_counselors_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_counselors_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty_members"
            referencedColumns: ["id"]
          },
        ]
      }
      department_settings: {
        Row: {
          break_periods: Json
          created_at: string
          department_id: string
          id: string
          period_duration: number
          periods_per_day: number
          updated_at: string
          working_days: number
        }
        Insert: {
          break_periods?: Json
          created_at?: string
          department_id: string
          id?: string
          period_duration?: number
          periods_per_day?: number
          updated_at?: string
          working_days?: number
        }
        Update: {
          break_periods?: Json
          created_at?: string
          department_id?: string
          id?: string
          period_duration?: number
          periods_per_day?: number
          updated_at?: string
          working_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "department_settings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: true
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      faculty_members: {
        Row: {
          created_at: string
          department_id: string
          designation: string | null
          email: string | null
          id: string
          name: string
          takes_electives: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id: string
          designation?: string | null
          email?: string | null
          id?: string
          name: string
          takes_electives?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          designation?: string | null
          email?: string | null
          id?: string
          name?: string
          takes_electives?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculty_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      faculty_subject_assignments: {
        Row: {
          created_at: string
          department_id: string
          faculty_id: string
          id: string
          section: string | null
          subject_id: string
          updated_at: string
          year: string
        }
        Insert: {
          created_at?: string
          department_id: string
          faculty_id: string
          id?: string
          section?: string | null
          subject_id: string
          updated_at?: string
          year: string
        }
        Update: {
          created_at?: string
          department_id?: string
          faculty_id?: string
          id?: string
          section?: string | null
          subject_id?: string
          updated_at?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculty_subject_assignments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faculty_subject_assignments_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faculty_subject_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_preferences: {
        Row: {
          created_at: string
          department_id: string
          evening_two_hour_start_at_5: boolean
          id: string
          morning_enabled: boolean
          morning_start: number | null
          priority: number | null
          section: string
          subject_id: string
          updated_at: string
          year: string
        }
        Insert: {
          created_at?: string
          department_id: string
          evening_two_hour_start_at_5?: boolean
          id?: string
          morning_enabled?: boolean
          morning_start?: number | null
          priority?: number | null
          section: string
          subject_id: string
          updated_at?: string
          year: string
        }
        Update: {
          created_at?: string
          department_id?: string
          evening_two_hour_start_at_5?: boolean
          id?: string
          morning_enabled?: boolean
          morning_start?: number | null
          priority?: number | null
          section?: string
          subject_id?: string
          updated_at?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_preferences_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_preferences_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_comments: {
        Row: {
          author: string
          content: string
          created_at: string
          id: string
          pr_id: string | null
        }
        Insert: {
          author: string
          content: string
          created_at?: string
          id?: string
          pr_id?: string | null
        }
        Update: {
          author?: string
          content?: string
          created_at?: string
          id?: string
          pr_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pr_comments_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "timetable_pull_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      section_subjects: {
        Row: {
          created_at: string
          department_id: string
          id: string
          section: string
          subject_id: string
          updated_at: string
          year: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          section: string
          subject_id: string
          updated_at?: string
          year: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          section?: string
          subject_id?: string
          updated_at?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_subjects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          abbreviation: string | null
          code: string | null
          created_at: string
          department_id: string
          hours_per_week: number
          id: string
          name: string
          order_id: number | null
          staff: string | null
          tags: string[] | null
          type: string
          updated_at: string
          year: string
        }
        Insert: {
          abbreviation?: string | null
          code?: string | null
          created_at?: string
          department_id: string
          hours_per_week: number
          id?: string
          name: string
          order_id?: number | null
          staff?: string | null
          tags?: string[] | null
          type: string
          updated_at?: string
          year: string
        }
        Update: {
          abbreviation?: string | null
          code?: string | null
          created_at?: string
          department_id?: string
          hours_per_week?: number
          id?: string
          name?: string
          order_id?: number | null
          staff?: string | null
          tags?: string[] | null
          type?: string
          updated_at?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_pull_requests: {
        Row: {
          created_at: string
          created_by: string
          current_grid_data: Json | null
          current_lab_preferences: Json | null
          current_special_flags: Json | null
          department_id: string | null
          description: string | null
          id: string
          proposed_grid_data: Json
          proposed_lab_preferences: Json | null
          proposed_special_flags: Json | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          section: string
          status: string
          title: string
          updated_at: string
          year: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_grid_data?: Json | null
          current_lab_preferences?: Json | null
          current_special_flags?: Json | null
          department_id?: string | null
          description?: string | null
          id?: string
          proposed_grid_data: Json
          proposed_lab_preferences?: Json | null
          proposed_special_flags?: Json | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          section: string
          status?: string
          title: string
          updated_at?: string
          year: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_grid_data?: Json | null
          current_lab_preferences?: Json | null
          current_special_flags?: Json | null
          department_id?: string | null
          description?: string | null
          id?: string
          proposed_grid_data?: Json
          proposed_lab_preferences?: Json | null
          proposed_special_flags?: Json | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          section?: string
          status?: string
          title?: string
          updated_at?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_pull_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      timetables: {
        Row: {
          department_id: string
          grid_data: Json
          id: string
          section: string
          special_flags: Json
          updated_at: string
          year: string
        }
        Insert: {
          department_id: string
          grid_data: Json
          id?: string
          section: string
          special_flags: Json
          updated_at?: string
          year: string
        }
        Update: {
          department_id?: string
          grid_data?: Json
          id?: string
          section?: string
          special_flags?: Json
          updated_at?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetables_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
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
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
