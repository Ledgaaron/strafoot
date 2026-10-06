// À régénérer via supabase gen types :
//   npx supabase gen types typescript --project-id <id> > lib/types.ts
// Contenu produit par @supabase/postgrest-typegen (moteur de supabase gen types)
// sur supabase/migrations/001_initial_schema.sql, puis aligné à la main sur 002
// (sessions.module ; user_id facultatif à l'insert grâce au défaut auth.uid()).
// Ne rien ajouter ici : le fichier est écrasé à chaque génération (types des
// colonnes jsonb : lib/json-types.ts).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      answers: {
        Row: {
          answered_at: string
          chosen_index: number
          created_at: string
          id: string
          question_id: string
          score: number
          user_id: string
        }
        Insert: {
          answered_at?: string
          chosen_index: number
          created_at?: string
          id?: string
          question_id: string
          score: number
          user_id?: string
        }
        Update: {
          answered_at?: string
          chosen_index?: number
          created_at?: string
          id?: string
          question_id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          birth_date: string | null
          club: string | null
          created_at: string
          id: string
          main_position: string | null
          secondary_position: string | null
          user_id: string
        }
        Insert: {
          birth_date?: string | null
          club?: string | null
          created_at?: string
          id?: string
          main_position?: string | null
          secondary_position?: string | null
          user_id?: string
        }
        Update: {
          birth_date?: string | null
          club?: string | null
          created_at?: string
          id?: string
          main_position?: string | null
          secondary_position?: string | null
          user_id?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          created_at: string
          id: string
          is_public: boolean
          level: number | null
          options: NonNullable<Json>
          positions: string[]
          situation: string
          source: string | null
          theme: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean
          level?: number | null
          options: NonNullable<Json>
          positions?: string[]
          situation: string
          source?: string | null
          theme: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
          level?: number | null
          options?: NonNullable<Json>
          positions?: string[]
          situation?: string
          source?: string | null
          theme?: string
          user_id?: string
        }
        Relationships: []
      }
      self_assessments: {
        Row: {
          created_at: string
          date: string
          grid: NonNullable<Json>
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          grid: NonNullable<Json>
          id?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          date?: string
          grid?: NonNullable<Json>
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          comment: string | null
          created_at: string
          date: string
          difficulty: number
          duration_min: number
          id: string
          module: string
          name: string | null
          sheet_id: string | null
          type: Database["public"]["Enums"]["session_type"]
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          date: string
          difficulty: number
          duration_min: number
          id?: string
          module?: string
          name?: string | null
          sheet_id?: string | null
          type: Database["public"]["Enums"]["session_type"]
          user_id?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          date?: string
          difficulty?: number
          duration_min?: number
          id?: string
          module?: string
          name?: string | null
          sheet_id?: string | null
          type?: Database["public"]["Enums"]["session_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "training_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      test_results: {
        Row: {
          comment: string | null
          created_at: string
          date: string
          id: string
          test_id: string
          user_id: string
          value: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          date: string
          id?: string
          test_id: string
          user_id?: string
          value: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          date?: string
          id?: string
          test_id?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "test_results_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      tests: {
        Row: {
          created_at: string
          id: string
          name: string
          protocol: string
          unit: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          protocol: string
          unit: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          protocol?: string
          unit?: string
          user_id?: string
        }
        Relationships: []
      }
      training_sheets: {
        Row: {
          created_at: string
          duration_min: number
          exercises: NonNullable<Json>
          id: string
          is_public: boolean
          positions: string[]
          skill: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_min: number
          exercises?: NonNullable<Json>
          id?: string
          is_public?: boolean
          positions?: string[]
          skill: string
          title: string
          user_id?: string
        }
        Update: {
          created_at?: string
          duration_min?: number
          exercises?: NonNullable<Json>
          id?: string
          is_public?: boolean
          positions?: string[]
          skill?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      session_type: "collectif" | "solo" | "match" | "recup" | "test"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      session_type: ["collectif", "solo", "match", "recup", "test"],
    },
  },
} as const
