export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      game_states: {
        Row: {
          action_deadline_at: string | null
          action_history: Json | null
          action_reopened_to: number[] | null
          board_state: Json | null
          burned_card_indices: number[] | null
          button_seat: number
          created_at: string
          current_actor_seat: number | null
          current_bet: number | null
          deck_seed: string
          hand_number: number
          id: string
          last_aggressor_seat: number | null
          last_raise_amount: number | null
          min_raise: number | null
          phase: Database["public"]["Enums"]["game_phase"]
          pot_size: number | null
          room_id: string
          seats_acted: number[] | null
          seats_to_act: number[] | null
          side_pots: Json | null
          updated_at: string
        }
        Insert: {
          action_deadline_at?: string | null
          action_history?: Json | null
          action_reopened_to?: number[] | null
          board_state?: Json | null
          burned_card_indices?: number[] | null
          button_seat: number
          created_at?: string
          current_actor_seat?: number | null
          current_bet?: number | null
          deck_seed: string
          hand_number: number
          id?: string
          last_aggressor_seat?: number | null
          last_raise_amount?: number | null
          min_raise?: number | null
          phase?: Database["public"]["Enums"]["game_phase"]
          pot_size?: number | null
          room_id: string
          seats_acted?: number[] | null
          seats_to_act?: number[] | null
          side_pots?: Json | null
          updated_at?: string
        }
        Update: {
          action_deadline_at?: string | null
          action_history?: Json | null
          action_reopened_to?: number[] | null
          board_state?: Json | null
          burned_card_indices?: number[] | null
          button_seat?: number
          created_at?: string
          current_actor_seat?: number | null
          current_bet?: number | null
          deck_seed?: string
          hand_number?: number
          id?: string
          last_aggressor_seat?: number | null
          last_raise_amount?: number | null
          min_raise?: number | null
          phase?: Database["public"]["Enums"]["game_phase"]
          pot_size?: number | null
          room_id?: string
          seats_acted?: number[] | null
          seats_to_act?: number[] | null
          side_pots?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_states_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      hand_results: {
        Row: {
          action_history: Json | null
          board_a: string[] | null
          board_b: string[] | null
          created_at: string
          final_pot: number
          hand_number: number
          id: string
          room_id: string
          shown_hands: Json | null
          winners: Json
        }
        Insert: {
          action_history?: Json | null
          board_a?: string[] | null
          board_b?: string[] | null
          created_at?: string
          final_pot: number
          hand_number: number
          id?: string
          room_id: string
          shown_hands?: Json | null
          winners: Json
        }
        Update: {
          action_history?: Json | null
          board_a?: string[] | null
          board_b?: string[] | null
          created_at?: string
          final_pot?: number
          hand_number?: number
          id?: string
          room_id?: string
          shown_hands?: Json | null
          winners?: Json
        }
        Relationships: [
          {
            foreignKeyName: "hand_results_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      player_actions: {
        Row: {
          action_type: Database["public"]["Enums"]["action_type"]
          amount: number | null
          created_at: string
          error_message: string | null
          game_state_id: string | null
          id: string
          processed: boolean | null
          processed_at: string | null
          room_id: string
          seat_number: number
          session_id: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["action_type"]
          amount?: number | null
          created_at?: string
          error_message?: string | null
          game_state_id?: string | null
          id?: string
          processed?: boolean | null
          processed_at?: string | null
          room_id: string
          seat_number: number
          session_id: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["action_type"]
          amount?: number | null
          created_at?: string
          error_message?: string | null
          game_state_id?: string | null
          id?: string
          processed?: boolean | null
          processed_at?: string | null
          room_id?: string
          seat_number?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_actions_game_state_id_fkey"
            columns: ["game_state_id"]
            isOneToOne: false
            referencedRelation: "game_states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_actions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      player_hands: {
        Row: {
          cards: Json
          created_at: string
          game_state_id: string
          id: string
          room_id: string
          seat_number: number
          session_id: string
        }
        Insert: {
          cards: Json
          created_at?: string
          game_state_id: string
          id?: string
          room_id: string
          seat_number: number
          session_id: string
        }
        Update: {
          cards?: Json
          created_at?: string
          game_state_id?: string
          id?: string
          room_id?: string
          seat_number?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_hands_game_state_id_fkey"
            columns: ["game_state_id"]
            isOneToOne: false
            referencedRelation: "game_states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_hands_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_players: {
        Row: {
          chip_stack: number
          connected_at: string | null
          current_bet: number | null
          display_name: string
          has_folded: boolean | null
          id: string
          is_all_in: boolean | null
          is_sitting_out: boolean | null
          is_spectating: boolean | null
          last_action_at: string | null
          room_id: string
          seat_number: number
          session_id: string
          total_buy_in: number
          total_invested_this_hand: number | null
        }
        Insert: {
          chip_stack: number
          connected_at?: string | null
          current_bet?: number | null
          display_name: string
          has_folded?: boolean | null
          id?: string
          is_all_in?: boolean | null
          is_sitting_out?: boolean | null
          is_spectating?: boolean | null
          last_action_at?: string | null
          room_id: string
          seat_number: number
          session_id: string
          total_buy_in?: number
          total_invested_this_hand?: number | null
        }
        Update: {
          chip_stack?: number
          connected_at?: string | null
          current_bet?: number | null
          display_name?: string
          has_folded?: boolean | null
          id?: string
          is_all_in?: boolean | null
          is_sitting_out?: boolean | null
          is_spectating?: boolean | null
          last_action_at?: string | null
          room_id?: string
          seat_number?: number
          session_id?: string
          total_buy_in?: number
          total_invested_this_hand?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "room_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          big_blind: number
          bomb_pot_ante: number
          button_seat: number | null
          created_at: string
          current_hand_number: number | null
          game_mode: Database["public"]["Enums"]["game_mode"]
          id: string
          is_active: boolean | null
          is_paused: boolean
          last_activity_at: string | null
          max_buy_in: number
          max_players: number
          min_buy_in: number
          owner_session_id: string
          small_blind: number
          updated_at: string
        }
        Insert: {
          big_blind: number
          bomb_pot_ante: number
          button_seat?: number | null
          created_at?: string
          current_hand_number?: number | null
          game_mode?: Database["public"]["Enums"]["game_mode"]
          id?: string
          is_active?: boolean | null
          is_paused?: boolean
          last_activity_at?: string | null
          max_buy_in: number
          max_players?: number
          min_buy_in: number
          owner_session_id: string
          small_blind: number
          updated_at?: string
        }
        Update: {
          big_blind?: number
          bomb_pot_ante?: number
          button_seat?: number | null
          created_at?: string
          current_hand_number?: number | null
          game_mode?: Database["public"]["Enums"]["game_mode"]
          id?: string
          is_active?: boolean | null
          is_paused?: boolean
          last_activity_at?: string | null
          max_buy_in?: number
          max_players?: number
          min_buy_in?: number
          owner_session_id?: string
          small_blind?: number
          updated_at?: string
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
      action_type: "fold" | "check" | "call" | "bet" | "raise" | "all_in"
      game_mode: "double_board_bomb_pot_plo"
      game_phase:
        | "waiting"
        | "dealing"
        | "flop"
        | "turn"
        | "river"
        | "showdown"
        | "complete"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      action_type: ["fold", "check", "call", "bet", "raise", "all_in"],
      game_mode: ["double_board_bomb_pot_plo"],
      game_phase: [
        "waiting",
        "dealing",
        "flop",
        "turn",
        "river",
        "showdown",
        "complete",
      ],
    },
  },
} as const

