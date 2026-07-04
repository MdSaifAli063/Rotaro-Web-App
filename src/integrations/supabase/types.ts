export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      attendance_records: {
        Row: {
          break_end: string | null;
          break_start: string | null;
          business_id: string;
          check_in_time: string | null;
          check_out_time: string | null;
          created_at: string;
          date: string;
          employee_id: string;
          id: string;
          status: string | null;
          updated_at: string;
          user_id: string;
          total_hours: number | null;
        };
        Insert: {
          break_end?: string | null;
          break_start?: string | null;
          business_id: string;
          check_in_time?: string | null;
          check_out_time?: string | null;
          created_at?: string;
          date: string;
          employee_id: string;
          id?: string;
          status?: string | null;
          user_id: string;
          total_hours?: number | null;
          updated_at?: string;
        };
        Update: {
          break_end?: string | null;
          break_start?: string | null;
          business_id?: string;
          check_in_time?: string | null;
          check_out_time?: string | null;
          created_at?: string;
          date?: string;
          employee_id?: string;
          id?: string;
          status?: string | null;
          user_id?: string;
          total_hours?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_records_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      businesses: {
        Row: {
          abn: string | null;
          break_options: number[] | null;
          business_email: string | null;
          business_phone: string | null;
          close_time: string | null;
          country: string | null;
          created_at: string;
          logo_url: string | null;
          overtime_after_hours: number | null;
          employment_types: string[] | null;
          id: string;
          is_onboarded: boolean;
          location: string | null;
          min_age: number | null;
          name: string;
          num_employees: number | null;
          open_days: string[] | null;
          open_time: string | null;
          owner_id: string;
          overtime_multiplier: number | null;
          timezone: string | null;
          state: string | null;
          updated_at: string;
        };
        Insert: {
          abn?: string | null;
          break_options?: number[] | null;
          business_email?: string | null;
          business_phone?: string | null;
          close_time?: string | null;
          country?: string | null;
          created_at?: string;
          logo_url?: string | null;
          overtime_after_hours?: number | null;
          employment_types?: string[] | null;
          id?: string;
          is_onboarded?: boolean;
          location?: string | null;
          min_age?: number | null;
          name?: string;
          num_employees?: number | null;
          open_days?: string[] | null;
          open_time?: string | null;
          overtime_multiplier?: number | null;
          timezone?: string | null;
          owner_id: string;
          state?: string | null;
          updated_at?: string;
        };
        Update: {
          abn?: string | null;
          break_options?: number[] | null;
          business_email?: string | null;
          business_phone?: string | null;
          close_time?: string | null;
          country?: string | null;
          created_at?: string;
          logo_url?: string | null;
          overtime_after_hours?: number | null;
          employment_types?: string[] | null;
          id?: string;
          is_onboarded?: boolean;
          location?: string | null;
          min_age?: number | null;
          name?: string;
          num_employees?: number | null;
          open_days?: string[] | null;
          open_time?: string | null;
          overtime_multiplier?: number | null;
          timezone?: string | null;
          owner_id?: string;
          state?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      employees: {
        Row: {
          age: number | null;
          business_id: string;
          created_at: string;
          department: string | null;
          email: string | null;
          employee_code: string | null;
          employment_type: string | null;
          id: string;
          leave_balance: number | null;
          name: string;
          pay_rate: number | null;
          phone: string | null;
          role: string | null;
          skills: string[] | null;
          start_date: string | null;
          status: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          age?: number | null;
          business_id: string;
          created_at?: string;
          department?: string | null;
          email?: string | null;
          employee_code?: string | null;
          employment_type?: string | null;
          id?: string;
          leave_balance?: number | null;
          name: string;
          pay_rate?: number | null;
          phone?: string | null;
          role?: string | null;
          skills?: string[] | null;
          start_date?: string | null;
          status?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          age?: number | null;
          business_id?: string;
          created_at?: string;
          department?: string | null;
          email?: string | null;
          employee_code?: string | null;
          employment_type?: string | null;
          id?: string;
          leave_balance?: number | null;
          name?: string;
          pay_rate?: number | null;
          phone?: string | null;
          role?: string | null;
          skills?: string[] | null;
          start_date?: string | null;
          status?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "employees_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      holidays: {
        Row: {
          business_id: string;
          country: string | null;
          created_at: string;
          holiday_date: string;
          holiday_name: string;
          id: string;
          is_custom: boolean;
          is_national: boolean;
          is_paid: boolean;
          state: string | null;
        };
        Insert: {
          business_id: string;
          country?: string | null;
          created_at?: string;
          holiday_date: string;
          holiday_name: string;
          id?: string;
          is_custom?: boolean;
          is_national?: boolean;
          is_paid?: boolean;
          state?: string | null;
        };
        Update: {
          business_id?: string;
          country?: string | null;
          created_at?: string;
          holiday_date?: string;
          holiday_name?: string;
          id?: string;
          is_custom?: boolean;
          is_national?: boolean;
          is_paid?: boolean;
          state?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "holidays_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      leave_balances: {
        Row: {
          business_id: string;
          created_at: string;
          employee_id: string;
          id: string;
          leave_type: string;
          total_days: number;
          updated_at: string;
          used_days: number;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          employee_id: string;
          id?: string;
          leave_type: string;
          total_days?: number;
          updated_at?: string;
          used_days?: number;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          employee_id?: string;
          id?: string;
          leave_type?: string;
          total_days?: number;
          updated_at?: string;
          used_days?: number;
        };
        Relationships: [
          {
            foreignKeyName: "leave_balances_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leave_balances_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      leaves: {
        Row: {
          business_id: string;
          created_at: string;
          employee_id: string;
          end_date: string | null;
          from_date: string;
          id: string;
          leave_type: string;
          reason: string | null;
          start_date: string | null;
          status: string;
          to_date: string;
          total_days: number;
          user_id: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          employee_id: string;
          end_date?: string | null;
          from_date: string;
          id?: string;
          leave_type: string;
          reason?: string | null;
          start_date?: string | null;
          status?: string;
          to_date: string;
          total_days?: number;
          user_id: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          employee_id?: string;
          end_date?: string | null;
          from_date?: string;
          id?: string;
          leave_type?: string;
          reason?: string | null;
          start_date?: string | null;
          status?: string;
          to_date?: string;
          total_days?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leaves_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leaves_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          business_id: string | null;
          created_at: string;
          deleted_at: string | null;
          dismissed_at: string | null;
          id: string;
          is_read: boolean;
          message: string;
          related_id: string | null;
          type: string;
          user_id: string;
        };
        Insert: {
          business_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          dismissed_at?: string | null;
          id?: string;
          is_read?: boolean;
          message: string;
          related_id?: string | null;
          type: string;
          user_id: string;
        };
        Update: {
          business_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          dismissed_at?: string | null;
          id?: string;
          is_read?: boolean;
          message?: string;
          related_id?: string | null;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          business_id: string;
          created_at: string;
          id: string;
          is_read: boolean;
          recipient_id: string;
          sender_id: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          business_id: string;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          recipient_id: string;
          sender_id: string;
          subject?: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          business_id?: string;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          recipient_id?: string;
          sender_id?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          business_id: string | null;
          created_at: string;
          date_of_birth: string | null;
          department: string | null;
          email: string;
          gender: string | null;
          id: string;
          name: string;
          notification_preferences: Json;
          phone: string | null;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          business_id?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          department?: string | null;
          email: string;
          gender?: string | null;
          id: string;
          name?: string;
          notification_preferences?: Json;
          phone?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          business_id?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          department?: string | null;
          email?: string;
          gender?: string | null;
          id?: string;
          name?: string;
          notification_preferences?: Json;
          phone?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      roster_shifts: {
        Row: {
          break_minutes: number | null;
          created_at: string;
          day: string;
          employee_id: string;
          end_time: string | null;
          id: string;
          roster_id: string;
          start_time: string | null;
          total_hours: number | null;
        };
        Insert: {
          break_minutes?: number | null;
          created_at?: string;
          day: string;
          employee_id: string;
          end_time?: string | null;
          id?: string;
          roster_id: string;
          start_time?: string | null;
          total_hours?: number | null;
        };
        Update: {
          break_minutes?: number | null;
          created_at?: string;
          day?: string;
          employee_id?: string;
          end_time?: string | null;
          id?: string;
          roster_id?: string;
          start_time?: string | null;
          total_hours?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "roster_shifts_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "roster_shifts_roster_id_fkey";
            columns: ["roster_id"];
            isOneToOne: false;
            referencedRelation: "rosters";
            referencedColumns: ["id"];
          },
        ];
      };
      rosters: {
        Row: {
          business_id: string;
          created_at: string;
          id: string;
          location: string | null;
          status: string;
          updated_at: string;
          week_end: string;
          week_start: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          id?: string;
          location?: string | null;
          status?: string;
          updated_at?: string;
          week_end: string;
          week_start: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          id?: string;
          location?: string | null;
          status?: string;
          updated_at?: string;
          week_end?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rosters_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      settings: {
        Row: {
          auto_approve_by_type: Json | null;
          auto_approve_leave: boolean;
          business_id: string;
          notification_settings: Json | null;
          updated_at: string;
        };
        Insert: {
          auto_approve_by_type?: Json | null;
          auto_approve_leave?: boolean;
          business_id: string;
          updated_at?: string;
          notification_settings?: Json | null;
        };
        Update: {
          auto_approve_by_type?: Json | null;
          auto_approve_leave?: boolean;
          business_id?: string;
          updated_at?: string;
          notification_settings?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "settings_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      shift_swaps: {
        Row: {
          business_id: string;
          created_at: string;
          id: string;
          note: string | null;
          requester_employee_id: string;
          requester_shift_id: string | null;
          status: string;
          target_employee_id: string;
          target_shift_id: string | null;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          requester_employee_id: string;
          requester_shift_id?: string | null;
          status?: string;
          target_employee_id: string;
          target_shift_id?: string | null;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          requester_employee_id?: string;
          requester_shift_id?: string | null;
          status?: string;
          target_employee_id?: string;
          target_shift_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shift_swaps_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_swaps_requester_employee_id_fkey";
            columns: ["requester_employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_swaps_requester_shift_id_fkey";
            columns: ["requester_shift_id"];
            isOneToOne: false;
            referencedRelation: "roster_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_swaps_target_employee_id_fkey";
            columns: ["target_employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_swaps_target_shift_id_fkey";
            columns: ["target_shift_id"];
            isOneToOne: false;
            referencedRelation: "roster_shifts";
            referencedColumns: ["id"];
          },
        ];
      };
      shift_templates: {
        Row: {
          break_minutes: number;
          business_id: string;
          color: string | null;
          created_at: string;
          department: string | null;
          end_time: string;
          id: string;
          min_staff_required: number | null;
          name: string;
          start_time: string;
          updated_at: string;
        };
        Insert: {
          break_minutes?: number;
          business_id: string;
          color?: string | null;
          created_at?: string;
          department?: string | null;
          end_time: string;
          id?: string;
          min_staff_required?: number | null;
          name: string;
          start_time: string;
          updated_at?: string;
        };
        Update: {
          break_minutes?: number;
          business_id?: string;
          color?: string | null;
          created_at?: string;
          department?: string | null;
          end_time?: string;
          id?: string;
          min_staff_required?: number | null;
          name?: string;
          start_time?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shift_templates_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_business_id: { Args: never; Returns: string };
      current_role: {
        Args: never;
        Returns: Database["public"]["Enums"]["app_role"];
      };
      is_manager_or_employer: { Args: never; Returns: boolean };
    };
    Enums: {
      app_role: "employer" | "manager" | "employee";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["employer", "employee", "manager"],
    },
  },
} as const;
