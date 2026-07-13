// Generated Supabase schema types — regenerate with the Supabase MCP
// generate_typescript_types tool (project tesujireg / ytgbimtjayecaxfyssta)
// or: npx supabase gen types typescript. Do not edit by hand.

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
      account_roles: {
        Row: {
          account_id: string
          created_at: string
          default_division_id: string | null
          role: string
        }
        Insert: {
          account_id: string
          created_at?: string
          default_division_id?: string | null
          role?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          default_division_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_roles_default_division_id_fkey"
            columns: ["default_division_id"]
            isOneToOne: false
            referencedRelation: "live_division"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      award_limit_exemption: {
        Row: {
          created_at: string
          created_by: string | null
          first_name_th: string
          first_name_th_normalized: string
          id: string
          last_name_th: string
          last_name_th_normalized: string
          note: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          first_name_th: string
          first_name_th_normalized: string
          id?: string
          last_name_th: string
          last_name_th_normalized: string
          note?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          first_name_th?: string
          first_name_th_normalized?: string
          id?: string
          last_name_th?: string
          last_name_th_normalized?: string
          note?: string | null
        }
        Relationships: []
      }
      category: {
        Row: {
          capacity: number
          code: string
          combinable_category_ids: string[]
          created_at: string
          fee_thb: number
          id: string
          max_age: number | null
          max_power_level: number | null
          min_age: number | null
          min_power_level: number | null
          name: string
          seats_taken: number
          skill_level: string
          sort_order: number
          tournament_id: string
          updated_at: string
        }
        Insert: {
          capacity: number
          code: string
          combinable_category_ids?: string[]
          created_at?: string
          fee_thb?: number
          id?: string
          max_age?: number | null
          max_power_level?: number | null
          min_age?: number | null
          min_power_level?: number | null
          name: string
          seats_taken?: number
          skill_level?: string
          sort_order?: number
          tournament_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          code?: string
          combinable_category_ids?: string[]
          created_at?: string
          fee_thb?: number
          id?: string
          max_age?: number | null
          max_power_level?: number | null
          min_age?: number | null
          min_power_level?: number | null
          name?: string
          seats_taken?: number
          skill_level?: string
          sort_order?: number
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament"
            referencedColumns: ["id"]
          },
        ]
      }
      go_institute: {
        Row: {
          active: boolean
          created_at: string
          id: string
          keywords: string[]
          name_normalized: string
          name_th: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          keywords?: string[]
          name_normalized: string
          name_th: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          keywords?: string[]
          name_normalized?: string
          name_th?: string
          updated_at?: string
        }
        Relationships: []
      }
      go_person: {
        Row: {
          created_at: string
          first_name_th: string
          first_name_th_normalized: string
          id: string
          is_ambiguous: boolean
          last_name_th: string
          last_name_th_normalized: string
          missing_since: string | null
          power_level: number | null
          resolved_source: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_name_th: string
          first_name_th_normalized: string
          id?: string
          is_ambiguous?: boolean
          last_name_th: string
          last_name_th_normalized: string
          missing_since?: string | null
          power_level?: number | null
          resolved_source?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_name_th?: string
          first_name_th_normalized?: string
          id?: string
          is_ambiguous?: boolean
          last_name_th?: string
          last_name_th_normalized?: string
          missing_since?: string | null
          power_level?: number | null
          resolved_source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      go_player_database: {
        Row: {
          category: string | null
          diamond: string | null
          event_date: string | null
          event_name: string | null
          first_name_th: string
          first_name_th_normalized: string
          id: string
          last_name_th: string
          last_name_th_normalized: string
          power_level: number
          prefix_th: string | null
          rank: string | null
          rank_award: number | null
          rank_in_category: string | null
          rating: number | null
          raw_data: Json | null
          seq: string | null
          source: string
          uploaded_at: string | null
          year_promoted: number | null
        }
        Insert: {
          category?: string | null
          diamond?: string | null
          event_date?: string | null
          event_name?: string | null
          first_name_th: string
          first_name_th_normalized: string
          id?: string
          last_name_th: string
          last_name_th_normalized: string
          power_level?: number
          prefix_th?: string | null
          rank?: string | null
          rank_award?: number | null
          rank_in_category?: string | null
          rating?: number | null
          raw_data?: Json | null
          seq?: string | null
          source: string
          uploaded_at?: string | null
          year_promoted?: number | null
        }
        Update: {
          category?: string | null
          diamond?: string | null
          event_date?: string | null
          event_name?: string | null
          first_name_th?: string
          first_name_th_normalized?: string
          id?: string
          last_name_th?: string
          last_name_th_normalized?: string
          power_level?: number
          prefix_th?: string | null
          rank?: string | null
          rank_award?: number | null
          rank_in_category?: string | null
          rating?: number | null
          raw_data?: Json | null
          seq?: string | null
          source?: string
          uploaded_at?: string | null
          year_promoted?: number | null
        }
        Relationships: []
      }
      institute_merge: {
        Row: {
          added_keywords: string[]
          id: string
          merged_at: string
          moved_players: string[]
          moved_profiles: string[]
          moved_seats: string[]
          reversed_at: string | null
          source_active: boolean
          source_id: string
          source_keywords: string[]
          source_name: string
          source_normalized: string
          target_id: string
          target_name: string
        }
        Insert: {
          added_keywords?: string[]
          id?: string
          merged_at?: string
          moved_players?: string[]
          moved_profiles?: string[]
          moved_seats?: string[]
          reversed_at?: string | null
          source_active?: boolean
          source_id: string
          source_keywords?: string[]
          source_name: string
          source_normalized: string
          target_id: string
          target_name: string
        }
        Update: {
          added_keywords?: string[]
          id?: string
          merged_at?: string
          moved_players?: string[]
          moved_profiles?: string[]
          moved_seats?: string[]
          reversed_at?: string | null
          source_active?: boolean
          source_id?: string
          source_keywords?: string[]
          source_name?: string
          source_normalized?: string
          target_id?: string
          target_name?: string
        }
        Relationships: []
      }
      live_config: {
        Row: {
          key: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: []
      }
      live_division: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      live_match: {
        Row: {
          black: string
          black_force: string
          black_score: string | null
          check_in: string
          created_at: string
          division_id: string
          id: string
          remark: string
          result: string
          round: string
          submitted_by: string
          table_no: string
          updated_at: string
          white: string
          white_force: string
          white_score: string | null
        }
        Insert: {
          black?: string
          black_force?: string
          black_score?: string | null
          check_in?: string
          created_at?: string
          division_id: string
          id?: string
          remark?: string
          result?: string
          round: string
          submitted_by?: string
          table_no: string
          updated_at?: string
          white?: string
          white_force?: string
          white_score?: string | null
        }
        Update: {
          black?: string
          black_force?: string
          black_score?: string | null
          check_in?: string
          created_at?: string
          division_id?: string
          id?: string
          remark?: string
          result?: string
          round?: string
          submitted_by?: string
          table_no?: string
          updated_at?: string
          white?: string
          white_force?: string
          white_score?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_match_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "live_division"
            referencedColumns: ["id"]
          },
        ]
      }
      live_match_bak_20260703: {
        Row: {
          black: string | null
          black_force: string | null
          check_in: string | null
          created_at: string | null
          division_id: string | null
          id: string | null
          remark: string | null
          result: string | null
          round: string | null
          submitted_by: string | null
          table_no: string | null
          updated_at: string | null
          white: string | null
          white_force: string | null
        }
        Insert: {
          black?: string | null
          black_force?: string | null
          check_in?: string | null
          created_at?: string | null
          division_id?: string | null
          id?: string | null
          remark?: string | null
          result?: string | null
          round?: string | null
          submitted_by?: string | null
          table_no?: string | null
          updated_at?: string | null
          white?: string | null
          white_force?: string | null
        }
        Update: {
          black?: string | null
          black_force?: string | null
          check_in?: string | null
          created_at?: string | null
          division_id?: string | null
          id?: string | null
          remark?: string | null
          result?: string | null
          round?: string | null
          submitted_by?: string | null
          table_no?: string | null
          updated_at?: string | null
          white?: string | null
          white_force?: string | null
        }
        Relationships: []
      }
      live_standing: {
        Row: {
          division_id: string
          headers: Json
          rows: Json
          updated_at: string
        }
        Insert: {
          division_id: string
          headers?: Json
          rows?: Json
          updated_at?: string
        }
        Update: {
          division_id?: string
          headers?: Json
          rows?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_standing_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: true
            referencedRelation: "live_division"
            referencedColumns: ["id"]
          },
        ]
      }
      managed_player: {
        Row: {
          archived_at: string | null
          created_at: string
          date_of_birth: string
          first_name_en: string
          first_name_th: string
          has_middle_name: boolean
          id: string
          institute_id: string | null
          institute_name: string | null
          last_name_en: string
          last_name_th: string
          matched_go_player_id: string | null
          middle_name_en: string | null
          middle_name_th: string | null
          mobile_phone: string
          owner_id: string
          pdpa_consent: boolean
          pdpa_consent_at: string | null
          person_id: string | null
          power_level: number | null
          province: string | null
          rank_self_declared: boolean
          title_custom: string | null
          title_prefix: Database["public"]["Enums"]["title_prefix"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          date_of_birth: string
          first_name_en: string
          first_name_th: string
          has_middle_name?: boolean
          id?: string
          institute_id?: string | null
          institute_name?: string | null
          last_name_en: string
          last_name_th: string
          matched_go_player_id?: string | null
          middle_name_en?: string | null
          middle_name_th?: string | null
          mobile_phone: string
          owner_id: string
          pdpa_consent?: boolean
          pdpa_consent_at?: string | null
          person_id?: string | null
          power_level?: number | null
          province?: string | null
          rank_self_declared?: boolean
          title_custom?: string | null
          title_prefix: Database["public"]["Enums"]["title_prefix"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          date_of_birth?: string
          first_name_en?: string
          first_name_th?: string
          has_middle_name?: boolean
          id?: string
          institute_id?: string | null
          institute_name?: string | null
          last_name_en?: string
          last_name_th?: string
          matched_go_player_id?: string | null
          middle_name_en?: string | null
          middle_name_th?: string | null
          mobile_phone?: string
          owner_id?: string
          pdpa_consent?: boolean
          pdpa_consent_at?: string | null
          person_id?: string | null
          power_level?: number | null
          province?: string | null
          rank_self_declared?: boolean
          title_custom?: string | null
          title_prefix?: Database["public"]["Enums"]["title_prefix"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "managed_player_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "go_institute"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managed_player_matched_go_player_id_fkey"
            columns: ["matched_go_player_id"]
            isOneToOne: false
            referencedRelation: "go_player_database"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managed_player_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "go_person"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          created_at: string
          date_of_birth: string
          first_name_en: string
          first_name_th: string
          has_middle_name: boolean
          id: string
          institute_id: string | null
          institute_name: string | null
          last_name_en: string
          last_name_th: string
          matched_go_player_id: string | null
          middle_name_en: string | null
          middle_name_th: string | null
          mobile_phone: string
          pdpa_consent: boolean
          pdpa_consent_at: string | null
          person_id: string | null
          power_level: number | null
          province: string | null
          rank_self_declared: boolean
          title_custom: string | null
          title_prefix: Database["public"]["Enums"]["title_prefix"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth: string
          first_name_en: string
          first_name_th: string
          has_middle_name?: boolean
          id: string
          institute_id?: string | null
          institute_name?: string | null
          last_name_en: string
          last_name_th: string
          matched_go_player_id?: string | null
          middle_name_en?: string | null
          middle_name_th?: string | null
          mobile_phone: string
          pdpa_consent?: boolean
          pdpa_consent_at?: string | null
          person_id?: string | null
          power_level?: number | null
          province?: string | null
          rank_self_declared?: boolean
          title_custom?: string | null
          title_prefix: Database["public"]["Enums"]["title_prefix"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string
          first_name_en?: string
          first_name_th?: string
          has_middle_name?: boolean
          id?: string
          institute_id?: string | null
          institute_name?: string | null
          last_name_en?: string
          last_name_th?: string
          matched_go_player_id?: string | null
          middle_name_en?: string | null
          middle_name_th?: string | null
          mobile_phone?: string
          pdpa_consent?: boolean
          pdpa_consent_at?: string | null
          person_id?: string | null
          power_level?: number | null
          province?: string | null
          rank_self_declared?: boolean
          title_custom?: string | null
          title_prefix?: Database["public"]["Enums"]["title_prefix"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "go_institute"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_matched_go_player_id_fkey"
            columns: ["matched_go_player_id"]
            isOneToOne: false
            referencedRelation: "go_player_database"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "go_person"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_code: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          kind: string
          max_uses: number | null
          note: string | null
          tournament_id: string
          updated_at: string
          used_count: number
          valid_from: string | null
          valid_until: string | null
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          kind: string
          max_uses?: number | null
          note?: string | null
          tournament_id: string
          updated_at?: string
          used_count?: number
          valid_from?: string | null
          valid_until?: string | null
          value?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          kind?: string
          max_uses?: number | null
          note?: string | null
          tournament_id?: string
          updated_at?: string
          used_count?: number
          valid_from?: string | null
          valid_until?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_redemption: {
        Row: {
          account_id: string | null
          batch_id: string
          discount_thb: number
          id: string
          promo_id: string
          redeemed_at: string
        }
        Insert: {
          account_id?: string | null
          batch_id: string
          discount_thb?: number
          id?: string
          promo_id: string
          redeemed_at?: string
        }
        Update: {
          account_id?: string | null
          batch_id?: string
          discount_thb?: number
          id?: string
          promo_id?: string
          redeemed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemption_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "registration_batch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemption_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promo_code"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_batch: {
        Row: {
          account_id: string | null
          admin_note: string | null
          created_at: string
          discount_thb: number
          hold_id: string | null
          id: string
          kind: Database["public"]["Enums"]["registration_kind"]
          payment_slip_url: string | null
          promo_code: string | null
          promo_kind: string | null
          promo_value: number | null
          reference_code: string
          reviewed_at: string | null
          reviewed_by: string | null
          slip_verified_at: string | null
          slip_verify_data: Json | null
          slip_verify_status: string | null
          status: Database["public"]["Enums"]["registration_status"]
          submitter_name: string | null
          submitter_phone: string
          total_amount_thb: number
          tournament_id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          admin_note?: string | null
          created_at?: string
          discount_thb?: number
          hold_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["registration_kind"]
          payment_slip_url?: string | null
          promo_code?: string | null
          promo_kind?: string | null
          promo_value?: number | null
          reference_code: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          slip_verified_at?: string | null
          slip_verify_data?: Json | null
          slip_verify_status?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          submitter_name?: string | null
          submitter_phone: string
          total_amount_thb?: number
          tournament_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          admin_note?: string | null
          created_at?: string
          discount_thb?: number
          hold_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["registration_kind"]
          payment_slip_url?: string | null
          promo_code?: string | null
          promo_kind?: string | null
          promo_value?: number | null
          reference_code?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          slip_verified_at?: string | null
          slip_verify_data?: Json | null
          slip_verify_status?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          submitter_name?: string | null
          submitter_phone?: string
          total_amount_thb?: number
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_batch_hold_id_fkey"
            columns: ["hold_id"]
            isOneToOne: false
            referencedRelation: "seat_hold"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_batch_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_seat: {
        Row: {
          batch_id: string
          category_id: string
          created_at: string
          date_of_birth: string
          fee_thb_snapshot: number
          first_name_en: string
          first_name_th: string
          has_middle_name: boolean
          id: string
          institute_id: string | null
          institute_name: string | null
          last_name_en: string
          last_name_th: string
          middle_name_en: string | null
          middle_name_th: string | null
          mobile_phone: string
          pdpa_consent: boolean
          pdpa_consent_at: string | null
          power_level: number | null
          province: string | null
          source_kind: string | null
          source_player_id: string | null
          title_custom: string | null
          title_prefix: Database["public"]["Enums"]["title_prefix"]
          withdrawn_at: string | null
        }
        Insert: {
          batch_id: string
          category_id: string
          created_at?: string
          date_of_birth: string
          fee_thb_snapshot: number
          first_name_en: string
          first_name_th: string
          has_middle_name?: boolean
          id?: string
          institute_id?: string | null
          institute_name?: string | null
          last_name_en: string
          last_name_th: string
          middle_name_en?: string | null
          middle_name_th?: string | null
          mobile_phone: string
          pdpa_consent?: boolean
          pdpa_consent_at?: string | null
          power_level?: number | null
          province?: string | null
          source_kind?: string | null
          source_player_id?: string | null
          title_custom?: string | null
          title_prefix: Database["public"]["Enums"]["title_prefix"]
          withdrawn_at?: string | null
        }
        Update: {
          batch_id?: string
          category_id?: string
          created_at?: string
          date_of_birth?: string
          fee_thb_snapshot?: number
          first_name_en?: string
          first_name_th?: string
          has_middle_name?: boolean
          id?: string
          institute_id?: string | null
          institute_name?: string | null
          last_name_en?: string
          last_name_th?: string
          middle_name_en?: string | null
          middle_name_th?: string | null
          mobile_phone?: string
          pdpa_consent?: boolean
          pdpa_consent_at?: string | null
          power_level?: number | null
          province?: string | null
          source_kind?: string | null
          source_player_id?: string | null
          title_custom?: string | null
          title_prefix?: Database["public"]["Enums"]["title_prefix"]
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registration_seat_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "registration_batch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_seat_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_seat_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "go_institute"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_hold: {
        Row: {
          batch_id: string | null
          created_at: string
          expires_at: string
          id: string
          released_at: string | null
          status: Database["public"]["Enums"]["hold_status"]
          tournament_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          released_at?: string | null
          status?: Database["public"]["Enums"]["hold_status"]
          tournament_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          released_at?: string | null
          status?: Database["public"]["Enums"]["hold_status"]
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_hold_batch_fk"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "registration_batch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_hold_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_hold_line: {
        Row: {
          category_id: string
          hold_id: string
          id: string
          seats: number
        }
        Insert: {
          category_id: string
          hold_id: string
          id?: string
          seats: number
        }
        Update: {
          category_id?: string
          hold_id?: string
          id?: string
          seats?: number
        }
        Relationships: [
          {
            foreignKeyName: "seat_hold_line_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_hold_line_hold_id_fkey"
            columns: ["hold_id"]
            isOneToOne: false
            referencedRelation: "seat_hold"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_withdrawal: {
        Row: {
          account_id: string | null
          bank_account_name: string
          bank_account_no: string
          bank_name: string
          batch_id: string
          batch_reference: string
          category_id: string | null
          category_label: string
          created_at: string
          fee_thb: number
          id: string
          person_name: string
          reason: string | null
          refund_slip_url: string | null
          refund_status: string
          resolved_at: string | null
          resolved_by: string | null
          seat_id: string
          tournament_id: string
        }
        Insert: {
          account_id?: string | null
          bank_account_name: string
          bank_account_no: string
          bank_name: string
          batch_id: string
          batch_reference: string
          category_id?: string | null
          category_label: string
          created_at?: string
          fee_thb: number
          id?: string
          person_name: string
          reason?: string | null
          refund_slip_url?: string | null
          refund_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          seat_id: string
          tournament_id: string
        }
        Update: {
          account_id?: string | null
          bank_account_name?: string
          bank_account_no?: string
          bank_name?: string
          batch_id?: string
          batch_reference?: string
          category_id?: string | null
          category_label?: string
          created_at?: string
          fee_thb?: number
          id?: string
          person_name?: string
          reason?: string | null
          refund_slip_url?: string | null
          refund_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          seat_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_withdrawal_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "registration_batch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_withdrawal_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_withdrawal_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "registration_seat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_withdrawal_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournament"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament: {
        Row: {
          banner_url: string | null
          competition_date: string
          created_at: string
          id: string
          location_maps_url: string
          location_text: string
          name_th: string
          promptpay_target_type: Database["public"]["Enums"]["promptpay_target_type"]
          promptpay_target_value: string
          registration_closes_at: string
          registration_opens_at: string
          rules_text: string
          schedule_text: string
          status: Database["public"]["Enums"]["tournament_status"]
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          competition_date?: string
          created_at?: string
          id?: string
          location_maps_url?: string
          location_text?: string
          name_th: string
          promptpay_target_type?: Database["public"]["Enums"]["promptpay_target_type"]
          promptpay_target_value?: string
          registration_closes_at: string
          registration_opens_at: string
          rules_text?: string
          schedule_text?: string
          status?: Database["public"]["Enums"]["tournament_status"]
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          competition_date?: string
          created_at?: string
          id?: string
          location_maps_url?: string
          location_text?: string
          name_th?: string
          promptpay_target_type?: Database["public"]["Enums"]["promptpay_target_type"]
          promptpay_target_value?: string
          registration_closes_at?: string
          registration_opens_at?: string
          rules_text?: string
          schedule_text?: string
          status?: Database["public"]["Enums"]["tournament_status"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _batch_json: { Args: { p_batch_id: string }; Returns: Json }
      _is_admin: { Args: { p_secret: string }; Returns: boolean }
      _is_live_writer: { Args: { p_secret: string }; Returns: boolean }
      _promo_discount: {
        Args: { p_gross: number; p_kind: string; p_value: number }
        Returns: number
      }
      _recompute_batch_total: {
        Args: { p_batch_id: string }
        Returns: undefined
      }
      admin_add_award_exemption: {
        Args: {
          p_admin_secret: string
          p_first_name_th: string
          p_last_name_th: string
          p_note?: string
        }
        Returns: Json
      }
      admin_category_stats: {
        Args: { p_admin_secret: string; p_tournament_id: string }
        Returns: Json
      }
      admin_clear_categories: {
        Args: {
          p_admin_secret: string
          p_confirm: string
          p_tournament_id: string
        }
        Returns: number
      }
      admin_clear_registrations: {
        Args: {
          p_admin_secret: string
          p_confirm: string
          p_tournament_id: string
        }
        Returns: number
      }
      admin_delete_batch: {
        Args: {
          p_admin_id?: string
          p_admin_secret: string
          p_batch_id: string
        }
        Returns: undefined
      }
      admin_delete_promo: {
        Args: { p_admin_secret: string; p_promo_id: string }
        Returns: undefined
      }
      admin_delete_seat: {
        Args: {
          p_admin_id?: string
          p_admin_secret: string
          p_batch_id: string
          p_seat_id: string
        }
        Returns: Json
      }
      admin_delete_tournament: {
        Args: {
          p_admin_secret: string
          p_confirm: string
          p_tournament_id: string
        }
        Returns: undefined
      }
      admin_get_batch: {
        Args: { p_admin_secret: string; p_batch_id: string }
        Returns: Json
      }
      admin_import_rank_database: {
        Args: { p_admin_secret: string; p_source: string; p_rows: Json }
        Returns: Json
      }
      admin_institute_counts: {
        Args: { p_admin_secret: string }
        Returns: Json
      }
      admin_list_award_exemptions: {
        Args: { p_admin_secret: string }
        Returns: Json
      }
      admin_list_institutes: {
        Args: { p_admin_secret: string }
        Returns: {
          active: boolean
          created_at: string
          id: string
          keywords: string[]
          name_normalized: string
          name_th: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "go_institute"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_judges: {
        Args: { p_admin_secret: string }
        Returns: {
          account_id: string
          default_division_id: string
          email: string
          first_name_th: string
        }[]
      }
      admin_list_promos: {
        Args: { p_admin_secret: string; p_tournament_id?: string }
        Returns: Json
      }
      admin_list_rank_conflicts: {
        Args: { p_admin_secret: string }
        Returns: {
          seat_id: string
          batch_reference: string
          tournament_name: string
          category_code: string
          category_name: string
          first_name_th: string
          last_name_th: string
          seat_power_level: number
          current_power_level: number
          min_power_level: number
          max_power_level: number
          source_kind: string
        }[]
      }
      admin_list_registrations: {
        Args: {
          p_admin_secret: string
          p_status?: string
          p_tournament_id: string
        }
        Returns: Json
      }
      admin_list_self_declared_ranks: {
        Args: { p_admin_secret: string }
        Returns: {
          kind: string
          id: string
          first_name_th: string
          last_name_th: string
          power_level: number
          mobile_phone: string
          person_id: string
          owner_label: string
          created_at: string
        }[]
      }
      admin_list_withdrawals: {
        Args: { p_admin_secret: string; p_tournament_id: string }
        Returns: Json
      }
      admin_remove_award_exemption: {
        Args: { p_admin_secret: string; p_id: string }
        Returns: undefined
      }
      admin_selective_reset: {
        Args: { p_confirm: string; p_keep_uid: string; p_targets: string[] }
        Returns: Json
      }
      admin_set_judge: {
        Args: {
          p_admin_secret: string
          p_default_division_id?: string
          p_email: string
          p_is_judge: boolean
        }
        Returns: undefined
      }
      admin_set_withdrawal_status: {
        Args: {
          p_admin_id?: string
          p_admin_secret: string
          p_refund_slip_url?: string
          p_status: string
          p_withdrawal_id: string
        }
        Returns: Json
      }
      admin_sync_player_ranks: {
        Args: { p_admin_secret: string }
        Returns: Json
      }
      admin_update_seat: {
        Args: {
          p_admin_id?: string
          p_admin_secret: string
          p_batch_id: string
          p_payload: Json
          p_seat_id: string
        }
        Returns: Json
      }
      admin_upsert_promo: {
        Args: { p_admin_secret: string; p_payload: Json }
        Returns: Json
      }
      apply_promo: {
        Args: { p_batch_id: string; p_code: string }
        Returns: Json
      }
      award_1kyu_event_count: {
        Args: { p_first: string; p_last: string }
        Returns: number
      }
      award_limit_is_exempt: {
        Args: { p_first: string; p_last: string }
        Returns: boolean
      }
      award_limit_status: {
        Args: { p_first_name_th: string; p_last_name_th: string }
        Returns: Json
      }
      confirm_registration: {
        Args: {
          p_admin_id?: string
          p_admin_secret: string
          p_batch_id: string
        }
        Returns: Json
      }
      delete_category: {
        Args: { p_admin_secret: string; p_id: string }
        Returns: undefined
      }
      delete_institute: {
        Args: { p_admin_secret: string; p_id: string }
        Returns: undefined
      }
      ensure_go_person: {
        Args: { p_first_name_th: string; p_last_name_th: string }
        Returns: string
      }
      find_or_create_institute: {
        Args: { p_name: string }
        Returns: {
          active: boolean
          created_at: string
          id: string
          keywords: string[]
          name_normalized: string
          name_th: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "go_institute"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_batch_public: { Args: { p_batch_id: string }; Returns: Json }
      has_dan_record: {
        Args: { p_first: string; p_last: string }
        Returns: boolean
      }
      is_admin_me: { Args: never; Returns: boolean }
      judge_get_token: { Args: never; Returns: string }
      list_institute_merges: { Args: { p_admin_secret: string }; Returns: Json }
      list_participants: { Args: { p_tournament_id: string }; Returns: Json }
      live_check_token: { Args: { p_secret: string }; Returns: boolean }
      live_clear_all: { Args: { p_admin_secret: string }; Returns: undefined }
      live_delete_division: {
        Args: { p_id: string; p_secret: string }
        Returns: undefined
      }
      live_delete_round: {
        Args: { p_division_id: string; p_round: string; p_secret: string }
        Returns: undefined
      }
      live_force_pairing: {
        Args: {
          p_division_id: string
          p_new_black: string
          p_new_white: string
          p_remark?: string
          p_round: string
          p_secret: string
          p_table: string
        }
        Returns: undefined
      }
      live_get_token: { Args: { p_admin_secret: string }; Returns: string }
      live_replace_round: {
        Args: {
          p_division_id: string
          p_matches: Json
          p_round: string
          p_secret: string
        }
        Returns: undefined
      }
      live_set_checkin: {
        Args: {
          p_checkin: string
          p_division_id: string
          p_round: string
          p_secret: string
          p_table: string
        }
        Returns: undefined
      }
      live_set_config: {
        Args: { p_key: string; p_secret: string; p_value: Json }
        Returns: undefined
      }
      live_set_force: {
        Args: {
          p_black_force: string
          p_division_id: string
          p_remark?: string
          p_round: string
          p_secret: string
          p_table: string
          p_white_force: string
        }
        Returns: undefined
      }
      live_set_standings: {
        Args: {
          p_division_id: string
          p_headers: Json
          p_rows: Json
          p_secret: string
        }
        Returns: undefined
      }
      live_submit_result: {
        Args: {
          p_by?: string
          p_division_id: string
          p_remark?: string
          p_result: string
          p_round: string
          p_secret: string
          p_table: string
        }
        Returns: undefined
      }
      live_toggle_checkin: {
        Args: {
          p_checked: boolean
          p_division_id: string
          p_round: string
          p_secret: string
          p_side: string
          p_table: string
        }
        Returns: undefined
      }
      live_upsert_division: {
        Args: {
          p_id: string
          p_name: string
          p_secret: string
          p_sort?: number
        }
        Returns: undefined
      }
      merge_institute: {
        Args: {
          p_admin_secret: string
          p_source_id: string
          p_target_id: string
        }
        Returns: Json
      }
      my_registrations: { Args: never; Returns: Json }
      normalize_thai_name: { Args: { input: string }; Returns: string }
      purge_institute: {
        Args: { p_admin_secret: string; p_id: string }
        Returns: undefined
      }
      reject_registration: {
        Args: {
          p_admin_id?: string
          p_admin_secret: string
          p_batch_id: string
          p_note: string
        }
        Returns: Json
      }
      release_batch: { Args: { p_batch_id: string }; Returns: undefined }
      release_expired_holds: {
        Args: { p_tournament_id?: string }
        Returns: number
      }
      replace_go_player_database_source: {
        Args: { p_admin_secret: string; p_rows: Json; p_source: string }
        Returns: number
      }
      reserve_seats: {
        Args: {
          p_kind: string
          p_seats: Json
          p_submitter_phone: string
          p_tournament_id: string
        }
        Returns: Json
      }
      search_go_person: {
        Args: {
          p_first_name_th: string
          p_last_name_th: string
          p_limit?: number
          p_sources?: string[]
        }
        Returns: {
          category: string
          diamond: string
          event_date: string
          event_name: string
          first_name_th: string
          id: string
          last_name_th: string
          match_type: string
          power_level: number
          rank: string
          rank_award: number
          rank_in_category: string
          rating: number
          raw_data: Json
          similarity_score: number
          source: string
          year_promoted: number
          person_id: string
          person_power_level: number
          person_is_ambiguous: boolean
        }[]
      }
      search_go_player_database: {
        Args: {
          p_first_name_th: string
          p_last_name_th: string
          p_limit?: number
          p_sources?: string[]
        }
        Returns: {
          category: string
          diamond: string
          event_date: string
          event_name: string
          first_name_th: string
          id: string
          last_name_th: string
          match_type: string
          power_level: number
          rank: string
          rank_award: number
          rank_in_category: string
          rating: number
          raw_data: Json
          similarity_score: number
          source: string
          year_promoted: number
        }[]
      }
      set_tournament_status: {
        Args: { p_admin_secret: string; p_id: string; p_status: string }
        Returns: Json
      }
      submit_registration: {
        Args: { p_batch_id: string; p_slip_url: string }
        Returns: Json
      }
      swap_seat: {
        Args: {
          p_category_id: string
          p_seat_id: string
          p_source_kind: string
          p_source_player_id: string
        }
        Returns: Json
      }
      unmerge_institute: {
        Args: { p_admin_secret: string; p_merge_id: string }
        Returns: {
          active: boolean
          created_at: string
          id: string
          keywords: string[]
          name_normalized: string
          name_th: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "go_institute"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_category: {
        Args: { p_admin_secret: string; p_payload: Json }
        Returns: Json
      }
      upsert_institute: {
        Args: { p_admin_secret: string; p_payload: Json }
        Returns: {
          active: boolean
          created_at: string
          id: string
          keywords: string[]
          name_normalized: string
          name_th: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "go_institute"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_tournament: {
        Args: { p_admin_secret: string; p_payload: Json }
        Returns: Json
      }
      withdraw_seat: {
        Args: {
          p_bank_account_name: string
          p_bank_account_no: string
          p_bank_name: string
          p_reason: string
          p_seat_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      hold_status: "active" | "consumed" | "released" | "expired"
      promptpay_target_type: "phone" | "national_id" | "merchant_qr"
      registration_kind: "self" | "group"
      registration_status:
        | "draft"
        | "pending_payment"
        | "pending_review"
        | "confirmed"
        | "rejected"
        | "expired"
        | "cancelled"
      title_prefix: "นาย" | "นาง" | "นางสาว" | "เด็กชาย" | "เด็กหญิง" | "อื่นๆ"
      tournament_status: "draft" | "published" | "closed"
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
      hold_status: ["active", "consumed", "released", "expired"],
      promptpay_target_type: ["phone", "national_id", "merchant_qr"],
      registration_kind: ["self", "group"],
      registration_status: [
        "draft",
        "pending_payment",
        "pending_review",
        "confirmed",
        "rejected",
        "expired",
        "cancelled",
      ],
      title_prefix: ["นาย", "นาง", "นางสาว", "เด็กชาย", "เด็กหญิง", "อื่นๆ"],
      tournament_status: ["draft", "published", "closed"],
    },
  },
} as const

