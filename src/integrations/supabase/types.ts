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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance_logs: {
        Row: {
          break_end: string | null
          break_minutes: number | null
          break_start: string | null
          clock_in: string | null
          clock_out: string | null
          created_at: string
          date: string
          id: string
          ip_address: string | null
          overtime_hours: number | null
          total_hours: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          break_end?: string | null
          break_minutes?: number | null
          break_start?: string | null
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          date?: string
          id?: string
          ip_address?: string | null
          overtime_hours?: number | null
          total_hours?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          break_end?: string | null
          break_minutes?: number | null
          break_start?: string | null
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          date?: string
          id?: string
          ip_address?: string | null
          overtime_hours?: number | null
          total_hours?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_off_credits: {
        Row: {
          created_at: string
          days_credited: number
          expires_at: string | null
          hours: number
          id: string
          note: string | null
          source_ot_id: string | null
          used: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          days_credited?: number
          expires_at?: string | null
          hours: number
          id?: string
          note?: string | null
          source_ot_id?: string | null
          used?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          days_credited?: number
          expires_at?: string | null
          hours?: number
          id?: string
          note?: string | null
          source_ot_id?: string | null
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      daily_work_logs: {
        Row: {
          created_at: string
          id: string
          log_date: string
          tasks: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          log_date?: string
          tasks?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          log_date?: string
          tasks?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          name: string
          updated_at: string
          wing: Database["public"]["Enums"]["company_wing"] | null
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          name: string
          updated_at?: string
          wing?: Database["public"]["Enums"]["company_wing"] | null
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
          updated_at?: string
          wing?: Database["public"]["Enums"]["company_wing"] | null
        }
        Relationships: []
      }
      leave_balances: {
        Row: {
          allocated: number
          carried_forward: number
          created_at: string
          id: string
          leave_type_id: string
          updated_at: string
          used: number
          user_id: string
          year: number
        }
        Insert: {
          allocated?: number
          carried_forward?: number
          created_at?: string
          id?: string
          leave_type_id: string
          updated_at?: string
          used?: number
          user_id: string
          year: number
        }
        Update: {
          allocated?: number
          carried_forward?: number
          created_at?: string
          id?: string
          leave_type_id?: string
          updated_at?: string
          used?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approver_id: string | null
          approver_note: string | null
          created_at: string
          day_type: Database["public"]["Enums"]["leave_day_type"]
          end_date: string
          id: string
          leave_type_id: string
          reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          total_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approver_id?: string | null
          approver_note?: string | null
          created_at?: string
          day_type?: Database["public"]["Enums"]["leave_day_type"]
          end_date: string
          id?: string
          leave_type_id: string
          reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          total_days: number
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approver_id?: string | null
          approver_note?: string | null
          created_at?: string
          day_type?: Database["public"]["Enums"]["leave_day_type"]
          end_date?: string
          id?: string
          leave_type_id?: string
          reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          total_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          accrual_per_month: number
          active: boolean
          annual_quota: number
          carry_forward_max: number
          code: string
          color: string
          created_at: string
          description: string | null
          encashable: boolean
          half_day_allowed: boolean
          id: string
          is_paid: boolean
          name: string
          updated_at: string
        }
        Insert: {
          accrual_per_month?: number
          active?: boolean
          annual_quota?: number
          carry_forward_max?: number
          code: string
          color?: string
          created_at?: string
          description?: string | null
          encashable?: boolean
          half_day_allowed?: boolean
          id?: string
          is_paid?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          accrual_per_month?: number
          active?: boolean
          annual_quota?: number
          carry_forward_max?: number
          code?: string
          color?: string
          created_at?: string
          description?: string | null
          encashable?: boolean
          half_day_allowed?: boolean
          id?: string
          is_paid?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          related_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      overtime_requests: {
        Row: {
          approved_by: string | null
          created_at: string
          date: string
          id: string
          reason: string | null
          requested_hours: number
          status: Database["public"]["Enums"]["ot_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          date: string
          id?: string
          reason?: string | null
          requested_hours: number
          status?: Database["public"]["Enums"]["ot_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          date?: string
          id?: string
          reason?: string | null
          requested_hours?: number
          status?: Database["public"]["Enums"]["ot_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_wing: Database["public"]["Enums"]["company_wing"]
          created_at: string
          daily_ot_cap: number
          department: string | null
          designation: string | null
          email: string | null
          employee_status: Database["public"]["Enums"]["employee_status"]
          full_name: string | null
          id: string
          joining_date: string | null
          monthly_ot_cap: number
          phone: string | null
          photo_url: string | null
          promotion_date: string | null
          reporting_manager_id: string | null
          resign_date: string | null
          service_status: Database["public"]["Enums"]["service_status"]
          updated_at: string
        }
        Insert: {
          company_wing?: Database["public"]["Enums"]["company_wing"]
          created_at?: string
          daily_ot_cap?: number
          department?: string | null
          designation?: string | null
          email?: string | null
          employee_status?: Database["public"]["Enums"]["employee_status"]
          full_name?: string | null
          id: string
          joining_date?: string | null
          monthly_ot_cap?: number
          phone?: string | null
          photo_url?: string | null
          promotion_date?: string | null
          reporting_manager_id?: string | null
          resign_date?: string | null
          service_status?: Database["public"]["Enums"]["service_status"]
          updated_at?: string
        }
        Update: {
          company_wing?: Database["public"]["Enums"]["company_wing"]
          created_at?: string
          daily_ot_cap?: number
          department?: string | null
          designation?: string | null
          email?: string | null
          employee_status?: Database["public"]["Enums"]["employee_status"]
          full_name?: string | null
          id?: string
          joining_date?: string | null
          monthly_ot_cap?: number
          phone?: string | null
          photo_url?: string | null
          promotion_date?: string | null
          reporting_manager_id?: string | null
          resign_date?: string | null
          service_status?: Database["public"]["Enums"]["service_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived: boolean
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
          owner_id: string
          updated_at: string
          wing: Database["public"]["Enums"]["company_wing"] | null
        }
        Insert: {
          archived?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
          owner_id: string
          updated_at?: string
          wing?: Database["public"]["Enums"]["company_wing"] | null
        }
        Update: {
          archived?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
          owner_id?: string
          updated_at?: string
          wing?: Database["public"]["Enums"]["company_wing"] | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          holiday_ot_multiplier: number
          id: string
          office_end_time: string
          office_start_time: string
          standard_shift_hours: number
          updated_at: string
          weekday_ot_multiplier: number
          weekend_days: number[]
          weekend_ot_multiplier: number
        }
        Insert: {
          created_at?: string
          holiday_ot_multiplier?: number
          id?: string
          office_end_time?: string
          office_start_time?: string
          standard_shift_hours?: number
          updated_at?: string
          weekday_ot_multiplier?: number
          weekend_days?: number[]
          weekend_ot_multiplier?: number
        }
        Update: {
          created_at?: string
          holiday_ot_multiplier?: number
          id?: string
          office_end_time?: string
          office_start_time?: string
          standard_shift_hours?: number
          updated_at?: string
          weekday_ot_multiplier?: number
          weekend_days?: number[]
          weekend_ot_multiplier?: number
        }
        Relationships: []
      }
      task_activity: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          detail: Json | null
          id: string
          task_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          detail?: Json | null
          id?: string
          task_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          detail?: Json | null
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          task_id: string
          uploader_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          task_id: string
          uploader_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          task_id?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_boards: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_boards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      task_columns: {
        Row: {
          board_id: string
          created_at: string
          id: string
          name: string
          position: number
          status: Database["public"]["Enums"]["task_status"]
          wip_limit: number | null
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          name: string
          position?: number
          status?: Database["public"]["Enums"]["task_status"]
          wip_limit?: number | null
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          status?: Database["public"]["Enums"]["task_status"]
          wip_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_watchers: {
        Row: {
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_watchers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_hours: number | null
          assignee_id: string | null
          board_id: string | null
          column_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          labels: string[] | null
          parent_task_id: string | null
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          reporter_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          story_points: number | null
          ticket_key: string | null
          title: string
          updated_at: string
        }
        Insert: {
          actual_hours?: number | null
          assignee_id?: string | null
          board_id?: string | null
          column_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          labels?: string[] | null
          parent_task_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          reporter_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          story_points?: number | null
          ticket_key?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          actual_hours?: number | null
          assignee_id?: string | null
          board_id?: string | null
          column_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          labels?: string[] | null
          parent_task_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          reporter_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          story_points?: number | null
          ticket_key?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "task_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_in_management_chain: {
        Args: { _employee_id: string; _manager_id: string }
        Returns: boolean
      }
      is_manager_of: {
        Args: { _employee_id: string; _manager_id: string }
        Returns: boolean
      }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      project_role_of: {
        Args: { _project_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["project_role"]
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "employee"
      company_wing: "GMGI" | "MORU"
      employee_status: "Active" | "Inactive" | "Resigned"
      leave_day_type: "full" | "first_half" | "second_half"
      leave_status: "pending" | "approved" | "rejected" | "cancelled"
      ot_status: "pending" | "approved" | "rejected" | "modified"
      project_role: "owner" | "member" | "viewer"
      service_status:
        | "Permanent"
        | "Contractual"
        | "Intern"
        | "Short-Term"
        | "Consultant"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "in_review" | "blocked" | "done"
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
    Enums: {
      app_role: ["admin", "manager", "employee"],
      company_wing: ["GMGI", "MORU"],
      employee_status: ["Active", "Inactive", "Resigned"],
      leave_day_type: ["full", "first_half", "second_half"],
      leave_status: ["pending", "approved", "rejected", "cancelled"],
      ot_status: ["pending", "approved", "rejected", "modified"],
      project_role: ["owner", "member", "viewer"],
      service_status: [
        "Permanent",
        "Contractual",
        "Intern",
        "Short-Term",
        "Consultant",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "in_progress", "in_review", "blocked", "done"],
    },
  },
} as const
