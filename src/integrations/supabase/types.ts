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
    }
    Enums: {
      app_role: "admin" | "manager" | "employee"
      company_wing: "GMGI" | "MORU"
      employee_status: "Active" | "Inactive" | "Resigned"
      ot_status: "pending" | "approved" | "rejected" | "modified"
      service_status:
        | "Permanent"
        | "Contractual"
        | "Intern"
        | "Short-Term"
        | "Consultant"
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
      ot_status: ["pending", "approved", "rejected", "modified"],
      service_status: [
        "Permanent",
        "Contractual",
        "Intern",
        "Short-Term",
        "Consultant",
      ],
    },
  },
} as const
