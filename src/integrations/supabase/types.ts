export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          business_id: string | null;
          created_at: string;
          details: Json;
          id: string;
          ip: string | null;
          outcome: string | null;
          risk_level: string | null;
          target_id: string | null;
          target_type: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          business_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: string;
          ip?: string | null;
          outcome?: string | null;
          risk_level?: string | null;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          business_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: string;
          ip?: string | null;
          outcome?: string | null;
          risk_level?: string | null;
          target_id?: string | null;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      administrative_levels: {
        Row: {
          active: boolean;
          country_id: string;
          default_name: string;
          id: string;
          level_number: number;
          translations: Json;
        };
        Insert: {
          active?: boolean;
          country_id: string;
          default_name: string;
          id?: string;
          level_number: number;
          translations?: Json;
        };
        Update: {
          active?: boolean;
          country_id?: string;
          default_name?: string;
          id?: string;
          level_number?: number;
          translations?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "administrative_levels_country_id_fkey";
            columns: ["country_id"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["id"];
          },
        ];
      };
      auth_login_attempts: {
        Row: {
          attempted_at: string;
          email: string;
          id: string;
        };
        Insert: {
          attempted_at?: string;
          email: string;
          id?: string;
        };
        Update: {
          attempted_at?: string;
          email?: string;
          id?: string;
        };
        Relationships: [];
      };
      auth_otp_codes: {
        Row: {
          attempts_used: number;
          code_hash: string;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          last_sent_at: string;
          max_attempts: number;
          metadata: Json;
          purpose: string;
          resend_count: number;
          target: string | null;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          attempts_used?: number;
          code_hash: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          last_sent_at?: string;
          max_attempts?: number;
          metadata?: Json;
          purpose: string;
          resend_count?: number;
          target?: string | null;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          attempts_used?: number;
          code_hash?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          last_sent_at?: string;
          max_attempts?: number;
          metadata?: Json;
          purpose?: string;
          resend_count?: number;
          target?: string | null;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      auth_role_policies: {
        Row: {
          is_locked: boolean;
          otp_enabled: boolean;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
        };
        Insert: {
          is_locked?: boolean;
          otp_enabled?: boolean;
          role: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Update: {
          is_locked?: boolean;
          otp_enabled?: boolean;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      auth_settings: {
        Row: {
          id: boolean;
          otp_expiry_minutes: number;
          otp_master_enabled: boolean;
          otp_max_attempts: number;
          otp_resend_cooldown_seconds: number;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          otp_expiry_minutes?: number;
          otp_master_enabled?: boolean;
          otp_max_attempts?: number;
          otp_resend_cooldown_seconds?: number;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          otp_expiry_minutes?: number;
          otp_master_enabled?: boolean;
          otp_max_attempts?: number;
          otp_resend_cooldown_seconds?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      auth_step_up_sessions: {
        Row: {
          session_id: string;
          user_id: string;
          verified_at: string;
        };
        Insert: {
          session_id: string;
          user_id: string;
          verified_at?: string;
        };
        Update: {
          session_id?: string;
          user_id?: string;
          verified_at?: string;
        };
        Relationships: [];
      };
      booking_items: {
        Row: {
          added_by: string | null;
          booking_id: string;
          branch_id: string;
          business_id: string;
          created_at: string;
          currency: string;
          duration_minutes: number;
          id: string;
          kind: string;
          price: number;
          service_id: string | null;
          service_name: string;
          service_name_ar: string | null;
          sort_order: number;
          staff_id: string | null;
        };
        Insert: {
          added_by?: string | null;
          booking_id: string;
          branch_id: string;
          business_id: string;
          created_at?: string;
          currency: string;
          duration_minutes: number;
          id?: string;
          kind?: string;
          price: number;
          service_id?: string | null;
          service_name: string;
          service_name_ar?: string | null;
          sort_order?: number;
          staff_id?: string | null;
        };
        Update: {
          added_by?: string | null;
          booking_id?: string;
          branch_id?: string;
          business_id?: string;
          created_at?: string;
          currency?: string;
          duration_minutes?: number;
          id?: string;
          kind?: string;
          price?: number;
          service_id?: string | null;
          service_name?: string;
          service_name_ar?: string | null;
          sort_order?: number;
          staff_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "booking_items_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_items_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "business_branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_items_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_items_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_items_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          branch_id: string;
          business_id: string;
          confirmation_attempted_at: string | null;
          confirmation_notes: string | null;
          confirmation_status: Database["public"]["Enums"]["booking_confirmation_status"];
          confirmed_by: string | null;
          created_at: string;
          customer_email: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          discount_amount: number;
          ends_at: string;
          hold_expires_at: string | null;
          id: string;
          notes: string | null;
          original_price: number | null;
          paid_at: string | null;
          paid_by: string | null;
          payment_status: Database["public"]["Enums"]["payment_status"];
          promotion_id: string | null;
          reference: string;
          service_id: string;
          staff_id: string;
          starts_at: string;
          status: Database["public"]["Enums"]["booking_status"];
          total_price: number;
          updated_at: string;
        };
        Insert: {
          branch_id: string;
          business_id: string;
          confirmation_attempted_at?: string | null;
          confirmation_notes?: string | null;
          confirmation_status?: Database["public"]["Enums"]["booking_confirmation_status"];
          confirmed_by?: string | null;
          created_at?: string;
          customer_email?: string | null;
          customer_id?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          discount_amount?: number;
          ends_at: string;
          hold_expires_at?: string | null;
          id?: string;
          notes?: string | null;
          original_price?: number | null;
          paid_at?: string | null;
          paid_by?: string | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          promotion_id?: string | null;
          reference?: string;
          service_id: string;
          staff_id: string;
          starts_at: string;
          status?: Database["public"]["Enums"]["booking_status"];
          total_price?: number;
          updated_at?: string;
        };
        Update: {
          branch_id?: string;
          business_id?: string;
          confirmation_attempted_at?: string | null;
          confirmation_notes?: string | null;
          confirmation_status?: Database["public"]["Enums"]["booking_confirmation_status"];
          confirmed_by?: string | null;
          created_at?: string;
          customer_email?: string | null;
          customer_id?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          discount_amount?: number;
          ends_at?: string;
          hold_expires_at?: string | null;
          id?: string;
          notes?: string | null;
          original_price?: number | null;
          paid_at?: string | null;
          paid_by?: string | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          promotion_id?: string | null;
          reference?: string;
          service_id?: string;
          staff_id?: string;
          starts_at?: string;
          status?: Database["public"]["Enums"]["booking_status"];
          total_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "business_branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_promotion_id_fkey";
            columns: ["promotion_id"];
            isOneToOne: false;
            referencedRelation: "promotions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      branch_hours: {
        Row: {
          branch_id: string;
          closes_at: string;
          created_at: string;
          id: string;
          opens_at: string;
          weekday: number;
        };
        Insert: {
          branch_id: string;
          closes_at: string;
          created_at?: string;
          id?: string;
          opens_at: string;
          weekday: number;
        };
        Update: {
          branch_id?: string;
          closes_at?: string;
          created_at?: string;
          id?: string;
          opens_at?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "branch_hours_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "business_branches";
            referencedColumns: ["id"];
          },
        ];
      };
      branch_services: {
        Row: {
          branch_id: string;
          created_at: string;
          duration_minutes: number | null;
          id: string;
          is_active: boolean;
          price: number | null;
          service_id: string;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          duration_minutes?: number | null;
          id?: string;
          is_active?: boolean;
          price?: number | null;
          service_id: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          duration_minutes?: number | null;
          id?: string;
          is_active?: boolean;
          price?: number | null;
          service_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branch_services_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "business_branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_services_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      business_branches: {
        Row: {
          address: string | null;
          buffer_minutes: number | null;
          business_id: string;
          city: string | null;
          country_id: string | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          is_main: boolean;
          latitude: number | null;
          longitude: number | null;
          name: string;
          phone: string | null;
          region_id: string | null;
          status: string;
          timezone: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          buffer_minutes?: number | null;
          business_id: string;
          city?: string | null;
          country_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          is_main?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          phone?: string | null;
          region_id?: string | null;
          status?: string;
          timezone?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          buffer_minutes?: number | null;
          business_id?: string;
          city?: string | null;
          country_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          is_main?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          phone?: string | null;
          region_id?: string | null;
          status?: string;
          timezone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_branches_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_branches_country_id_fkey";
            columns: ["country_id"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_branches_region_id_fkey";
            columns: ["region_id"];
            isOneToOne: false;
            referencedRelation: "regions";
            referencedColumns: ["id"];
          },
        ];
      };
      business_categories: {
        Row: {
          business_id: string;
          category_id: string;
          created_at: string;
        };
        Insert: {
          business_id: string;
          category_id: string;
          created_at?: string;
        };
        Update: {
          business_id?: string;
          category_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_categories_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_categories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      business_domain_verifications: {
        Row: {
          business_id: string;
          created_at: string;
          domain: string;
          id: string;
          method: string;
          status: string;
          token: string | null;
          updated_at: string;
          verified_at: string | null;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          domain: string;
          id?: string;
          method?: string;
          status?: string;
          token?: string | null;
          updated_at?: string;
          verified_at?: string | null;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          domain?: string;
          id?: string;
          method?: string;
          status?: string;
          token?: string | null;
          updated_at?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "business_domain_verifications_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_gallery: {
        Row: {
          before_url: string | null;
          business_id: string;
          caption: string | null;
          caption_ar: string | null;
          category: string;
          created_at: string;
          id: string;
          sort_order: number;
          url: string;
        };
        Insert: {
          before_url?: string | null;
          business_id: string;
          caption?: string | null;
          caption_ar?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          sort_order?: number;
          url: string;
        };
        Update: {
          before_url?: string | null;
          business_id?: string;
          caption?: string | null;
          caption_ar?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          sort_order?: number;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_gallery_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_hours: {
        Row: {
          business_id: string;
          closes_at: string;
          created_at: string;
          id: string;
          is_closed: boolean;
          opens_at: string;
          updated_at: string;
          weekday: number;
        };
        Insert: {
          business_id: string;
          closes_at?: string;
          created_at?: string;
          id?: string;
          is_closed?: boolean;
          opens_at?: string;
          updated_at?: string;
          weekday: number;
        };
        Update: {
          business_id?: string;
          closes_at?: string;
          created_at?: string;
          id?: string;
          is_closed?: boolean;
          opens_at?: string;
          updated_at?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "business_hours_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_memberships: {
        Row: {
          accepted_at: string | null;
          business_id: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          invited_at: string | null;
          invited_by: string | null;
          is_primary_owner: boolean;
          role_id: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          business_id: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          invited_at?: string | null;
          invited_by?: string | null;
          is_primary_owner?: boolean;
          role_id: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          accepted_at?: string | null;
          business_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          invited_at?: string | null;
          invited_by?: string | null;
          is_primary_owner?: boolean;
          role_id?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_memberships_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_memberships_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "platform_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      business_slug_redirects: {
        Row: {
          business_id: string;
          created_at: string;
          created_by: string | null;
          hit_count: number;
          id: string;
          last_hit_at: string | null;
          new_slug: string;
          old_slug: string;
          redirect_type: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          hit_count?: number;
          id?: string;
          last_hit_at?: string | null;
          new_slug: string;
          old_slug: string;
          redirect_type: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          hit_count?: number;
          id?: string;
          last_hit_at?: string | null;
          new_slug?: string;
          old_slug?: string;
          redirect_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_slug_redirects_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      businesses: {
        Row: {
          accept_card: boolean;
          accept_cash: boolean;
          accept_online: boolean;
          address: string | null;
          allow_waitlist: boolean;
          amenities: string[];
          area: string;
          area_ar: string | null;
          awards: string[];
          booking_confirmation: string;
          branch_count: number | null;
          brands: string[];
          buffer_minutes: number;
          business_email: string | null;
          business_phone: string | null;
          business_type: string | null;
          cancellation_hours: number;
          cancellation_policy: string | null;
          cancellation_policy_ar: string | null;
          categories: string[];
          certifications: string[];
          city: string;
          closes_at: string;
          country: string | null;
          country_code: string;
          cover_url: string | null;
          created_at: string;
          currency: string;
          deleted_at: string | null;
          deposit_percent: number;
          description: string | null;
          description_ar: string | null;
          distance_km: number;
          district: string | null;
          employee_count: number | null;
          facebook_url: string | null;
          faq: Json;
          hold_minutes: number | null;
          house_rules: string | null;
          house_rules_ar: string | null;
          id: string;
          image_url: string | null;
          instagram_url: string | null;
          instant_booking: boolean;
          is_active: boolean;
          is_listed: boolean;
          is_verified: boolean;
          languages: string[];
          latitude: number | null;
          logo_url: string | null;
          longitude: number | null;
          maps_url: string | null;
          marketplace_note: string | null;
          marketplace_status: Database["public"]["Enums"]["marketplace_status"];
          max_booking_days: number;
          min_notice_hours: number;
          name: string;
          name_ar: string | null;
          notify_cancellation: boolean;
          notify_daily_summary: boolean;
          notify_email_address: string | null;
          notify_new_booking: boolean;
          notify_review: boolean;
          opens_at: string;
          owner_id: string | null;
          owner_story: string | null;
          owner_story_ar: string | null;
          phone: string | null;
          plan: Database["public"]["Enums"]["subscription_plan"];
          postal_code: string | null;
          price_range: string;
          rating: number;
          region_id: string | null;
          rejection_reason: string | null;
          reminder_offsets_minutes: number[];
          require_confirmation_call: boolean;
          require_deposit: boolean;
          review_count: number;
          reviewed_at: string | null;
          reviewed_by: string | null;
          seo_description: string | null;
          seo_keywords: string | null;
          seo_title: string | null;
          slot_interval_minutes: number;
          slug: string;
          slug_source: string;
          status: Database["public"]["Enums"]["business_status"];
          submitted_at: string | null;
          tax_rate: number;
          terms_accepted_at: string | null;
          tiktok_url: string | null;
          timezone: string;
          trial_ends_at: string | null;
          updated_at: string;
          verified_at: string | null;
          verified_by: string | null;
          video_tour_url: string | null;
          website_url: string | null;
        };
        Insert: {
          accept_card?: boolean;
          accept_cash?: boolean;
          accept_online?: boolean;
          address?: string | null;
          allow_waitlist?: boolean;
          amenities?: string[];
          area?: string;
          area_ar?: string | null;
          awards?: string[];
          booking_confirmation?: string;
          branch_count?: number | null;
          brands?: string[];
          buffer_minutes?: number;
          business_email?: string | null;
          business_phone?: string | null;
          business_type?: string | null;
          cancellation_hours?: number;
          cancellation_policy?: string | null;
          cancellation_policy_ar?: string | null;
          categories?: string[];
          certifications?: string[];
          city?: string;
          closes_at?: string;
          country?: string | null;
          country_code?: string;
          cover_url?: string | null;
          created_at?: string;
          currency?: string;
          deleted_at?: string | null;
          deposit_percent?: number;
          description?: string | null;
          description_ar?: string | null;
          distance_km?: number;
          district?: string | null;
          employee_count?: number | null;
          facebook_url?: string | null;
          faq?: Json;
          hold_minutes?: number | null;
          house_rules?: string | null;
          house_rules_ar?: string | null;
          id?: string;
          image_url?: string | null;
          instagram_url?: string | null;
          instant_booking?: boolean;
          is_active?: boolean;
          is_listed?: boolean;
          is_verified?: boolean;
          languages?: string[];
          latitude?: number | null;
          logo_url?: string | null;
          longitude?: number | null;
          maps_url?: string | null;
          marketplace_note?: string | null;
          marketplace_status?: Database["public"]["Enums"]["marketplace_status"];
          max_booking_days?: number;
          min_notice_hours?: number;
          name: string;
          name_ar?: string | null;
          notify_cancellation?: boolean;
          notify_daily_summary?: boolean;
          notify_email_address?: string | null;
          notify_new_booking?: boolean;
          notify_review?: boolean;
          opens_at?: string;
          owner_id?: string | null;
          owner_story?: string | null;
          owner_story_ar?: string | null;
          phone?: string | null;
          plan?: Database["public"]["Enums"]["subscription_plan"];
          postal_code?: string | null;
          price_range?: string;
          rating?: number;
          region_id?: string | null;
          rejection_reason?: string | null;
          reminder_offsets_minutes?: number[];
          require_confirmation_call?: boolean;
          require_deposit?: boolean;
          review_count?: number;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          seo_description?: string | null;
          seo_keywords?: string | null;
          seo_title?: string | null;
          slot_interval_minutes?: number;
          slug: string;
          slug_source?: string;
          status?: Database["public"]["Enums"]["business_status"];
          submitted_at?: string | null;
          tax_rate?: number;
          terms_accepted_at?: string | null;
          tiktok_url?: string | null;
          timezone?: string;
          trial_ends_at?: string | null;
          updated_at?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          video_tour_url?: string | null;
          website_url?: string | null;
        };
        Update: {
          accept_card?: boolean;
          accept_cash?: boolean;
          accept_online?: boolean;
          address?: string | null;
          allow_waitlist?: boolean;
          amenities?: string[];
          area?: string;
          area_ar?: string | null;
          awards?: string[];
          booking_confirmation?: string;
          branch_count?: number | null;
          brands?: string[];
          buffer_minutes?: number;
          business_email?: string | null;
          business_phone?: string | null;
          business_type?: string | null;
          cancellation_hours?: number;
          cancellation_policy?: string | null;
          cancellation_policy_ar?: string | null;
          categories?: string[];
          certifications?: string[];
          city?: string;
          closes_at?: string;
          country?: string | null;
          country_code?: string;
          cover_url?: string | null;
          created_at?: string;
          currency?: string;
          deleted_at?: string | null;
          deposit_percent?: number;
          description?: string | null;
          description_ar?: string | null;
          distance_km?: number;
          district?: string | null;
          employee_count?: number | null;
          facebook_url?: string | null;
          faq?: Json;
          hold_minutes?: number | null;
          house_rules?: string | null;
          house_rules_ar?: string | null;
          id?: string;
          image_url?: string | null;
          instagram_url?: string | null;
          instant_booking?: boolean;
          is_active?: boolean;
          is_listed?: boolean;
          is_verified?: boolean;
          languages?: string[];
          latitude?: number | null;
          logo_url?: string | null;
          longitude?: number | null;
          maps_url?: string | null;
          marketplace_note?: string | null;
          marketplace_status?: Database["public"]["Enums"]["marketplace_status"];
          max_booking_days?: number;
          min_notice_hours?: number;
          name?: string;
          name_ar?: string | null;
          notify_cancellation?: boolean;
          notify_daily_summary?: boolean;
          notify_email_address?: string | null;
          notify_new_booking?: boolean;
          notify_review?: boolean;
          opens_at?: string;
          owner_id?: string | null;
          owner_story?: string | null;
          owner_story_ar?: string | null;
          phone?: string | null;
          plan?: Database["public"]["Enums"]["subscription_plan"];
          postal_code?: string | null;
          price_range?: string;
          rating?: number;
          region_id?: string | null;
          rejection_reason?: string | null;
          reminder_offsets_minutes?: number[];
          require_confirmation_call?: boolean;
          require_deposit?: boolean;
          review_count?: number;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          seo_description?: string | null;
          seo_keywords?: string | null;
          seo_title?: string | null;
          slot_interval_minutes?: number;
          slug?: string;
          slug_source?: string;
          status?: Database["public"]["Enums"]["business_status"];
          submitted_at?: string | null;
          tax_rate?: number;
          terms_accepted_at?: string | null;
          tiktok_url?: string | null;
          timezone?: string;
          trial_ends_at?: string | null;
          updated_at?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          video_tour_url?: string | null;
          website_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "businesses_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["iso_code"];
          },
          {
            foreignKeyName: "businesses_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "businesses_region_id_fkey";
            columns: ["region_id"];
            isOneToOne: false;
            referencedRelation: "regions";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          active: boolean;
          created_at: string;
          default_name: string;
          description: string | null;
          display_order: number;
          icon: string;
          id: string;
          image_url: string | null;
          parent_id: string | null;
          translations: Json;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          default_name: string;
          description?: string | null;
          display_order?: number;
          icon: string;
          id?: string;
          image_url?: string | null;
          parent_id?: string | null;
          translations?: Json;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          default_name?: string;
          description?: string | null;
          display_order?: number;
          icon?: string;
          id?: string;
          image_url?: string | null;
          parent_id?: string | null;
          translations?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      cities: {
        Row: {
          active: boolean;
          default_name: string;
          id: string;
          postal_code: string | null;
          region_id: string;
          translations: Json;
        };
        Insert: {
          active?: boolean;
          default_name: string;
          id?: string;
          postal_code?: string | null;
          region_id: string;
          translations?: Json;
        };
        Update: {
          active?: boolean;
          default_name?: string;
          id?: string;
          postal_code?: string | null;
          region_id?: string;
          translations?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "cities_region_id_fkey";
            columns: ["region_id"];
            isOneToOne: false;
            referencedRelation: "regions";
            referencedColumns: ["id"];
          },
        ];
      };
      commission_rules: {
        Row: {
          active: boolean;
          basis: string;
          business_id: string | null;
          country_id: string | null;
          created_at: string;
          effective_from: string;
          id: string;
          rate_percent: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          basis?: string;
          business_id?: string | null;
          country_id?: string | null;
          created_at?: string;
          effective_from?: string;
          id?: string;
          rate_percent?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          basis?: string;
          business_id?: string | null;
          country_id?: string | null;
          created_at?: string;
          effective_from?: string;
          id?: string;
          rate_percent?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commission_rules_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_rules_country_id_fkey";
            columns: ["country_id"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["id"];
          },
        ];
      };
      countries: {
        Row: {
          active: boolean;
          calling_code: string;
          created_at: string;
          currency_code: string;
          default_buffer_minutes: number;
          default_hold_minutes: number;
          default_name: string;
          display_order: number;
          flag: string;
          id: string;
          iso_code: string;
          marketplace_enabled: boolean;
          timezone: string;
          translations: Json;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          calling_code: string;
          created_at?: string;
          currency_code: string;
          default_buffer_minutes?: number;
          default_hold_minutes?: number;
          default_name: string;
          display_order?: number;
          flag: string;
          id?: string;
          iso_code: string;
          marketplace_enabled?: boolean;
          timezone: string;
          translations?: Json;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          calling_code?: string;
          created_at?: string;
          currency_code?: string;
          default_buffer_minutes?: number;
          default_hold_minutes?: number;
          default_name?: string;
          display_order?: number;
          flag?: string;
          id?: string;
          iso_code?: string;
          marketplace_enabled?: boolean;
          timezone?: string;
          translations?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "countries_currency_code_fkey";
            columns: ["currency_code"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
        ];
      };
      currencies: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          decimal_digits: number;
          name: string;
          symbol: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          decimal_digits?: number;
          name: string;
          symbol: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          decimal_digits?: number;
          name?: string;
          symbol?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      device_tokens: {
        Row: {
          created_at: string;
          device_name: string | null;
          id: string;
          last_seen_at: string;
          platform: string;
          revoked_at: string | null;
          token: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device_name?: string | null;
          id?: string;
          last_seen_at?: string;
          platform: string;
          revoked_at?: string | null;
          token: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device_name?: string | null;
          id?: string;
          last_seen_at?: string;
          platform?: string;
          revoked_at?: string | null;
          token?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      email_domain_rules: {
        Row: {
          active: boolean;
          category: Database["public"]["Enums"]["email_domain_category"];
          created_at: string;
          domain: string;
          id: string;
          reason: string | null;
          source: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          category: Database["public"]["Enums"]["email_domain_category"];
          created_at?: string;
          domain: string;
          id?: string;
          reason?: string | null;
          source?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          category?: Database["public"]["Enums"]["email_domain_category"];
          created_at?: string;
          domain?: string;
          id?: string;
          reason?: string | null;
          source?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      favorites: {
        Row: {
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["favorite_kind"];
          target_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["favorite_kind"];
          target_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["favorite_kind"];
          target_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      holidays: {
        Row: {
          branch_id: string | null;
          business_id: string | null;
          closes_at: string | null;
          country_id: string | null;
          created_at: string;
          created_by: string | null;
          date: string;
          id: string;
          is_closed: boolean;
          name: string;
          opens_at: string | null;
          scope: string;
        };
        Insert: {
          branch_id?: string | null;
          business_id?: string | null;
          closes_at?: string | null;
          country_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          date: string;
          id?: string;
          is_closed?: boolean;
          name: string;
          opens_at?: string | null;
          scope: string;
        };
        Update: {
          branch_id?: string | null;
          business_id?: string | null;
          closes_at?: string | null;
          country_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          date?: string;
          id?: string;
          is_closed?: boolean;
          name?: string;
          opens_at?: string | null;
          scope?: string;
        };
        Relationships: [
          {
            foreignKeyName: "holidays_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "business_branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "holidays_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "holidays_country_id_fkey";
            columns: ["country_id"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["id"];
          },
        ];
      };
      idempotency_keys: {
        Row: {
          actor_id: string | null;
          completed_at: string | null;
          created_at: string;
          id: string;
          idempotency_key: string;
          operation: string;
          response: Json | null;
          status: string;
        };
        Insert: {
          actor_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          idempotency_key: string;
          operation: string;
          response?: Json | null;
          status?: string;
        };
        Update: {
          actor_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          idempotency_key?: string;
          operation?: string;
          response?: Json | null;
          status?: string;
        };
        Relationships: [];
      };
      ledger_transactions: {
        Row: {
          account_ref: string;
          account_type: Database["public"]["Enums"]["ledger_account_type"];
          actor_id: string | null;
          amount: number;
          booking_id: string | null;
          business_id: string | null;
          created_at: string;
          currency: string;
          direction: Database["public"]["Enums"]["ledger_direction"];
          id: string;
          metadata: Json;
          payment_id: string | null;
          reason: string | null;
          transaction_group_id: string;
          type: string;
        };
        Insert: {
          account_ref: string;
          account_type: Database["public"]["Enums"]["ledger_account_type"];
          actor_id?: string | null;
          amount: number;
          booking_id?: string | null;
          business_id?: string | null;
          created_at?: string;
          currency: string;
          direction: Database["public"]["Enums"]["ledger_direction"];
          id?: string;
          metadata?: Json;
          payment_id?: string | null;
          reason?: string | null;
          transaction_group_id: string;
          type: string;
        };
        Update: {
          account_ref?: string;
          account_type?: Database["public"]["Enums"]["ledger_account_type"];
          actor_id?: string | null;
          amount?: number;
          booking_id?: string | null;
          business_id?: string | null;
          created_at?: string;
          currency?: string;
          direction?: Database["public"]["Enums"]["ledger_direction"];
          id?: string;
          metadata?: Json;
          payment_id?: string | null;
          reason?: string | null;
          transaction_group_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ledger_transactions_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_transactions_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_transactions_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "ledger_transactions_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_deliveries: {
        Row: {
          attempt_number: number;
          channel: string;
          created_at: string;
          delivered_at: string | null;
          error_code: string | null;
          error_message: string | null;
          failed_at: string | null;
          id: string;
          notification_id: string | null;
          outbox_id: string;
          provider: string | null;
          provider_reference: string | null;
          recipient_user_id: string;
          sent_at: string | null;
          status: string;
        };
        Insert: {
          attempt_number?: number;
          channel: string;
          created_at?: string;
          delivered_at?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          failed_at?: string | null;
          id?: string;
          notification_id?: string | null;
          outbox_id: string;
          provider?: string | null;
          provider_reference?: string | null;
          recipient_user_id: string;
          sent_at?: string | null;
          status: string;
        };
        Update: {
          attempt_number?: number;
          channel?: string;
          created_at?: string;
          delivered_at?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          failed_at?: string | null;
          id?: string;
          notification_id?: string | null;
          outbox_id?: string;
          provider?: string | null;
          provider_reference?: string | null;
          recipient_user_id?: string;
          sent_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: false;
            referencedRelation: "notifications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_deliveries_outbox_id_fkey";
            columns: ["outbox_id"];
            isOneToOne: false;
            referencedRelation: "notification_outbox";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_outbox: {
        Row: {
          actor_id: string | null;
          attempts: number;
          booking_id: string | null;
          business_id: string | null;
          claimed_at: string | null;
          created_at: string;
          dedupe_key: string | null;
          event_type: string;
          id: string;
          last_error: string | null;
          next_attempt_at: string;
          payload: Json;
          payment_id: string | null;
          processed_at: string | null;
          status: string;
        };
        Insert: {
          actor_id?: string | null;
          attempts?: number;
          booking_id?: string | null;
          business_id?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          event_type: string;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          payload?: Json;
          payment_id?: string | null;
          processed_at?: string | null;
          status?: string;
        };
        Update: {
          actor_id?: string | null;
          attempts?: number;
          booking_id?: string | null;
          business_id?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          event_type?: string;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          payload?: Json;
          payment_id?: string | null;
          processed_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_outbox_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_outbox_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_outbox_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_preferences: {
        Row: {
          business_id: string | null;
          category: string;
          channel: string;
          created_at: string;
          enabled: boolean;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          business_id?: string | null;
          category: string;
          channel: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          business_id?: string | null;
          category?: string;
          channel?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_preferences_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string;
          booking_id: string | null;
          business_id: string | null;
          category: string | null;
          created_at: string;
          deep_link: string | null;
          id: string;
          kind: string;
          read_at: string | null;
          title: string;
          updated_at: string;
          user_id: string;
          waitlist_id: string | null;
        };
        Insert: {
          body?: string;
          booking_id?: string | null;
          business_id?: string | null;
          category?: string | null;
          created_at?: string;
          deep_link?: string | null;
          id?: string;
          kind: string;
          read_at?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
          waitlist_id?: string | null;
        };
        Update: {
          body?: string;
          booking_id?: string | null;
          business_id?: string | null;
          category?: string | null;
          created_at?: string;
          deep_link?: string | null;
          id?: string;
          kind?: string;
          read_at?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
          waitlist_id?: string | null;
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
      payment_intents: {
        Row: {
          booking_id: string;
          business_id: string;
          completed_at: string | null;
          created_at: string;
          currency: string;
          customer_id: string | null;
          expected_amount: number;
          expires_at: string | null;
          id: string;
          method_code: string;
          provider: string;
          provider_reference: string | null;
          status: string;
        };
        Insert: {
          booking_id: string;
          business_id: string;
          completed_at?: string | null;
          created_at?: string;
          currency: string;
          customer_id?: string | null;
          expected_amount: number;
          expires_at?: string | null;
          id?: string;
          method_code: string;
          provider: string;
          provider_reference?: string | null;
          status?: string;
        };
        Update: {
          booking_id?: string;
          business_id?: string;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          customer_id?: string | null;
          expected_amount?: number;
          expires_at?: string | null;
          id?: string;
          method_code?: string;
          provider?: string;
          provider_reference?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_intents_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_intents_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_intents_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "payment_intents_method_code_fkey";
            columns: ["method_code"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["code"];
          },
        ];
      };
      payment_methods: {
        Row: {
          active: boolean;
          business_enabled: boolean;
          code: string;
          configuration: Json;
          country_id: string | null;
          created_at: string;
          customer_enabled: boolean;
          display_order: number;
          id: string;
          is_online: boolean;
          maximum_amount: number | null;
          minimum_amount: number | null;
          name: string;
          provider: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          business_enabled?: boolean;
          code: string;
          configuration?: Json;
          country_id?: string | null;
          created_at?: string;
          customer_enabled?: boolean;
          display_order?: number;
          id?: string;
          is_online?: boolean;
          maximum_amount?: number | null;
          minimum_amount?: number | null;
          name: string;
          provider?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          business_enabled?: boolean;
          code?: string;
          configuration?: Json;
          country_id?: string | null;
          created_at?: string;
          customer_enabled?: boolean;
          display_order?: number;
          id?: string;
          is_online?: boolean;
          maximum_amount?: number | null;
          minimum_amount?: number | null;
          name?: string;
          provider?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_methods_country_id_fkey";
            columns: ["country_id"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          booking_id: string;
          business_id: string;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          customer_id: string | null;
          difference_note: string | null;
          difference_reason: string | null;
          expected_amount: number;
          id: string;
          kind: string;
          method_code: string;
          provider: string | null;
          provider_reference: string | null;
          received_amount: number | null;
          status: Database["public"]["Enums"]["payment_status"];
        };
        Insert: {
          booking_id: string;
          business_id: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency: string;
          customer_id?: string | null;
          difference_note?: string | null;
          difference_reason?: string | null;
          expected_amount: number;
          id?: string;
          kind?: string;
          method_code: string;
          provider?: string | null;
          provider_reference?: string | null;
          received_amount?: number | null;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Update: {
          booking_id?: string;
          business_id?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          difference_note?: string | null;
          difference_reason?: string | null;
          expected_amount?: number;
          id?: string;
          kind?: string;
          method_code?: string;
          provider?: string | null;
          provider_reference?: string | null;
          received_amount?: number | null;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "payments_method_code_fkey";
            columns: ["method_code"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["code"];
          },
        ];
      };
      permissions: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          key: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          key: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          key?: string;
        };
        Relationships: [];
      };
      platform_roles: {
        Row: {
          business_id: string | null;
          created_at: string;
          id: string;
          is_system: boolean;
          key: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          business_id?: string | null;
          created_at?: string;
          id?: string;
          is_system?: boolean;
          key: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          business_id?: string | null;
          created_at?: string;
          id?: string;
          is_system?: boolean;
          key?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_roles_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_security_settings: {
        Row: {
          bot_challenge_provider: string;
          id: boolean;
          required_challenge_threshold: number;
          risk_challenge_threshold: number;
          updated_at: string;
        };
        Insert: {
          bot_challenge_provider?: string;
          id?: boolean;
          required_challenge_threshold?: number;
          risk_challenge_threshold?: number;
          updated_at?: string;
        };
        Update: {
          bot_challenge_provider?: string;
          id?: boolean;
          required_challenge_threshold?: number;
          risk_challenge_threshold?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          allergies: string | null;
          avatar_url: string | null;
          beauty_notes: string | null;
          birthday: string | null;
          country_code: string | null;
          created_at: string;
          deleted_at: string | null;
          detected_country_code: string | null;
          favorite_categories: string[];
          full_name: string;
          gender: string | null;
          hair_type: string | null;
          id: string;
          locale: string;
          notify_email: boolean;
          notify_in_app: boolean;
          notify_push: boolean;
          notify_sms: boolean;
          notify_whatsapp: boolean;
          phone: string | null;
          skin_type: string | null;
          updated_at: string;
        };
        Insert: {
          allergies?: string | null;
          avatar_url?: string | null;
          beauty_notes?: string | null;
          birthday?: string | null;
          country_code?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          detected_country_code?: string | null;
          favorite_categories?: string[];
          full_name?: string;
          gender?: string | null;
          hair_type?: string | null;
          id: string;
          locale?: string;
          notify_email?: boolean;
          notify_in_app?: boolean;
          notify_push?: boolean;
          notify_sms?: boolean;
          notify_whatsapp?: boolean;
          phone?: string | null;
          skin_type?: string | null;
          updated_at?: string;
        };
        Update: {
          allergies?: string | null;
          avatar_url?: string | null;
          beauty_notes?: string | null;
          birthday?: string | null;
          country_code?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          detected_country_code?: string | null;
          favorite_categories?: string[];
          full_name?: string;
          gender?: string | null;
          hair_type?: string | null;
          id?: string;
          locale?: string;
          notify_email?: boolean;
          notify_in_app?: boolean;
          notify_push?: boolean;
          notify_sms?: boolean;
          notify_whatsapp?: boolean;
          phone?: string | null;
          skin_type?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      promotions: {
        Row: {
          business_id: string;
          code: string;
          created_at: string;
          description: string | null;
          discount_type: string;
          discount_value: number;
          ends_at: string | null;
          id: string;
          is_active: boolean;
          max_uses: number | null;
          min_amount: number;
          starts_at: string | null;
          updated_at: string;
          used_count: number;
        };
        Insert: {
          business_id: string;
          code: string;
          created_at?: string;
          description?: string | null;
          discount_type?: string;
          discount_value: number;
          ends_at?: string | null;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          min_amount?: number;
          starts_at?: string | null;
          updated_at?: string;
          used_count?: number;
        };
        Update: {
          business_id?: string;
          code?: string;
          created_at?: string;
          description?: string | null;
          discount_type?: string;
          discount_value?: number;
          ends_at?: string | null;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          min_amount?: number;
          starts_at?: string | null;
          updated_at?: string;
          used_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "promotions_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_limit_hits: {
        Row: {
          bucket: string;
          created_at: string;
          id: string;
        };
        Insert: {
          bucket: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [];
      };
      recently_viewed: {
        Row: {
          business_id: string;
          id: string;
          user_id: string;
          viewed_at: string;
        };
        Insert: {
          business_id: string;
          id?: string;
          user_id: string;
          viewed_at?: string;
        };
        Update: {
          business_id?: string;
          id?: string;
          user_id?: string;
          viewed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recently_viewed_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      refunds: {
        Row: {
          actor_id: string;
          amount: number;
          completed_at: string | null;
          created_at: string;
          currency: string;
          id: string;
          payment_id: string;
          reason: string;
          status: string;
        };
        Insert: {
          actor_id: string;
          amount: number;
          completed_at?: string | null;
          created_at?: string;
          currency: string;
          id?: string;
          payment_id: string;
          reason: string;
          status?: string;
        };
        Update: {
          actor_id?: string;
          amount?: number;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          payment_id?: string;
          reason?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "refunds_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "refunds_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      regions: {
        Row: {
          active: boolean;
          code: string | null;
          country_id: string;
          default_name: string;
          id: string;
          translations: Json;
        };
        Insert: {
          active?: boolean;
          code?: string | null;
          country_id: string;
          default_name: string;
          id?: string;
          translations?: Json;
        };
        Update: {
          active?: boolean;
          code?: string | null;
          country_id?: string;
          default_name?: string;
          id?: string;
          translations?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "regions_country_id_fkey";
            columns: ["country_id"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["id"];
          },
        ];
      };
      reserved_slugs: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          reason: string | null;
          slug: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          reason?: string | null;
          slug: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          reason?: string | null;
          slug?: string;
        };
        Relationships: [];
      };
      review_reports: {
        Row: {
          created_at: string;
          id: string;
          reason: string;
          reporter_id: string;
          review_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          reason?: string;
          reporter_id: string;
          review_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          reason?: string;
          reporter_id?: string;
          review_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_reports_review_id_fkey";
            columns: ["review_id"];
            isOneToOne: false;
            referencedRelation: "reviews";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          body: string;
          booking_id: string | null;
          business_id: string;
          created_at: string;
          customer_id: string;
          id: string;
          is_hidden: boolean;
          owner_replied_at: string | null;
          owner_reply: string | null;
          photos: string[];
          rating: number;
          report_count: number;
          service_id: string | null;
          staff_id: string | null;
          updated_at: string;
        };
        Insert: {
          body?: string;
          booking_id?: string | null;
          business_id: string;
          created_at?: string;
          customer_id: string;
          id?: string;
          is_hidden?: boolean;
          owner_replied_at?: string | null;
          owner_reply?: string | null;
          photos?: string[];
          rating: number;
          report_count?: number;
          service_id?: string | null;
          staff_id?: string | null;
          updated_at?: string;
        };
        Update: {
          body?: string;
          booking_id?: string | null;
          business_id?: string;
          created_at?: string;
          customer_id?: string;
          id?: string;
          is_hidden?: boolean;
          owner_replied_at?: string | null;
          owner_reply?: string | null;
          photos?: string[];
          rating?: number;
          report_count?: number;
          service_id?: string | null;
          staff_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          permission_id: string;
          role_id: string;
          scope: Database["public"]["Enums"]["permission_scope"];
        };
        Insert: {
          permission_id: string;
          role_id: string;
          scope?: Database["public"]["Enums"]["permission_scope"];
        };
        Update: {
          permission_id?: string;
          role_id?: string;
          scope?: Database["public"]["Enums"]["permission_scope"];
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey";
            columns: ["permission_id"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "platform_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          buffer_minutes: number | null;
          business_id: string;
          category: string;
          cleanup_minutes: number;
          created_at: string;
          deleted_at: string | null;
          deposit: number | null;
          description: string | null;
          description_ar: string | null;
          discount_price: number | null;
          duration_minutes: number;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name: string;
          name_ar: string | null;
          price: number;
          processing_minutes: number;
          tag: string | null;
          visibility: string;
        };
        Insert: {
          buffer_minutes?: number | null;
          business_id: string;
          category?: string;
          cleanup_minutes?: number;
          created_at?: string;
          deleted_at?: string | null;
          deposit?: number | null;
          description?: string | null;
          description_ar?: string | null;
          discount_price?: number | null;
          duration_minutes?: number;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name: string;
          name_ar?: string | null;
          price?: number;
          processing_minutes?: number;
          tag?: string | null;
          visibility?: string;
        };
        Update: {
          buffer_minutes?: number | null;
          business_id?: string;
          category?: string;
          cleanup_minutes?: number;
          created_at?: string;
          deleted_at?: string | null;
          deposit?: number | null;
          description?: string | null;
          description_ar?: string | null;
          discount_price?: number | null;
          duration_minutes?: number;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name?: string;
          name_ar?: string | null;
          price?: number;
          processing_minutes?: number;
          tag?: string | null;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      staff: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          business_id: string;
          certificates: string[];
          created_at: string;
          deleted_at: string | null;
          email: string | null;
          experience_years: number | null;
          full_name: string;
          full_name_ar: string | null;
          id: string;
          invite_accepted_at: string | null;
          invited_at: string | null;
          is_active: boolean;
          languages: string[];
          phone: string | null;
          portfolio: string[];
          social_links: Json;
          title: string;
          title_ar: string | null;
          user_id: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          business_id: string;
          certificates?: string[];
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          experience_years?: number | null;
          full_name: string;
          full_name_ar?: string | null;
          id?: string;
          invite_accepted_at?: string | null;
          invited_at?: string | null;
          is_active?: boolean;
          languages?: string[];
          phone?: string | null;
          portfolio?: string[];
          social_links?: Json;
          title?: string;
          title_ar?: string | null;
          user_id?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          business_id?: string;
          certificates?: string[];
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          experience_years?: number | null;
          full_name?: string;
          full_name_ar?: string | null;
          id?: string;
          invite_accepted_at?: string | null;
          invited_at?: string | null;
          is_active?: boolean;
          languages?: string[];
          phone?: string | null;
          portfolio?: string[];
          social_links?: Json;
          title?: string;
          title_ar?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "staff_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_branch_day_hours: {
        Row: {
          branch_id: string;
          created_at: string;
          day: string;
          ends_at: string;
          id: string;
          staff_id: string;
          starts_at: string;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          day: string;
          ends_at: string;
          id?: string;
          staff_id: string;
          starts_at: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          day?: string;
          ends_at?: string;
          id?: string;
          staff_id?: string;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_branch_day_hours_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "business_branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_branch_day_hours_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_branch_schedules: {
        Row: {
          branch_id: string;
          created_at: string;
          ends_at: string;
          id: string;
          staff_id: string;
          starts_at: string;
          weekday: number;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          ends_at: string;
          id?: string;
          staff_id: string;
          starts_at: string;
          weekday: number;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          ends_at?: string;
          id?: string;
          staff_id?: string;
          starts_at?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "staff_branch_schedules_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "business_branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_branch_schedules_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_branches: {
        Row: {
          branch_id: string;
          created_at: string;
          id: string;
          is_primary: boolean;
          staff_id: string;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          staff_id: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_branches_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "business_branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_branches_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_breaks: {
        Row: {
          branch_id: string;
          created_at: string;
          ends_at: string;
          id: string;
          label: string;
          staff_id: string;
          starts_at: string;
          weekday: number;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          ends_at?: string;
          id?: string;
          label?: string;
          staff_id: string;
          starts_at?: string;
          weekday: number;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          ends_at?: string;
          id?: string;
          label?: string;
          staff_id?: string;
          starts_at?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "staff_breaks_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "business_branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_breaks_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_day_hours: {
        Row: {
          created_at: string;
          day: string;
          ends_at: string;
          id: string;
          staff_id: string;
          starts_at: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          day: string;
          ends_at: string;
          id?: string;
          staff_id: string;
          starts_at: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          day?: string;
          ends_at?: string;
          id?: string;
          staff_id?: string;
          starts_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_day_hours_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_join_requests: {
        Row: {
          business_id: string;
          created_at: string;
          full_name: string;
          id: string;
          message: string | null;
          phone: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          staff_id: string | null;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          full_name: string;
          id?: string;
          message?: string | null;
          phone?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          staff_id?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          full_name?: string;
          id?: string;
          message?: string | null;
          phone?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          staff_id?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_join_requests_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_join_requests_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_payout_rules: {
        Row: {
          active: boolean;
          business_id: string;
          created_at: string;
          effective_from: string;
          fixed_amount: number | null;
          id: string;
          percentage: number | null;
          service_id: string | null;
          staff_id: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          business_id: string;
          created_at?: string;
          effective_from?: string;
          fixed_amount?: number | null;
          id?: string;
          percentage?: number | null;
          service_id?: string | null;
          staff_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          business_id?: string;
          created_at?: string;
          effective_from?: string;
          fixed_amount?: number | null;
          id?: string;
          percentage?: number | null;
          service_id?: string | null;
          staff_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_payout_rules_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_payout_rules_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_payout_rules_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_payouts: {
        Row: {
          actor_id: string | null;
          amount: number;
          business_id: string;
          created_at: string;
          currency: string;
          id: string;
          method_code: string | null;
          paid_at: string | null;
          period_end: string;
          period_start: string;
          reference: string | null;
          staff_id: string;
          status: string;
        };
        Insert: {
          actor_id?: string | null;
          amount: number;
          business_id: string;
          created_at?: string;
          currency: string;
          id?: string;
          method_code?: string | null;
          paid_at?: string | null;
          period_end: string;
          period_start: string;
          reference?: string | null;
          staff_id: string;
          status?: string;
        };
        Update: {
          actor_id?: string | null;
          amount?: number;
          business_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          method_code?: string | null;
          paid_at?: string | null;
          period_end?: string;
          period_start?: string;
          reference?: string | null;
          staff_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_payouts_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_payouts_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "staff_payouts_method_code_fkey";
            columns: ["method_code"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "staff_payouts_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_schedules: {
        Row: {
          ends_at: string;
          id: string;
          staff_id: string;
          starts_at: string;
          weekday: number;
        };
        Insert: {
          ends_at?: string;
          id?: string;
          staff_id: string;
          starts_at?: string;
          weekday: number;
        };
        Update: {
          ends_at?: string;
          id?: string;
          staff_id?: string;
          starts_at?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "staff_schedules_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_services: {
        Row: {
          branch_id: string | null;
          created_at: string;
          custom_duration_minutes: number | null;
          custom_price: number | null;
          id: string;
          service_id: string;
          staff_id: string;
        };
        Insert: {
          branch_id?: string | null;
          created_at?: string;
          custom_duration_minutes?: number | null;
          custom_price?: number | null;
          id?: string;
          service_id: string;
          staff_id: string;
        };
        Update: {
          branch_id?: string | null;
          created_at?: string;
          custom_duration_minutes?: number | null;
          custom_price?: number | null;
          id?: string;
          service_id?: string;
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_services_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "business_branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_services_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_services_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_time_off: {
        Row: {
          branch_id: string | null;
          created_at: string;
          day: string;
          ends_at: string | null;
          id: string;
          reason: string;
          staff_id: string;
          starts_at: string | null;
        };
        Insert: {
          branch_id?: string | null;
          created_at?: string;
          day: string;
          ends_at?: string | null;
          id?: string;
          reason?: string;
          staff_id: string;
          starts_at?: string | null;
        };
        Update: {
          branch_id?: string | null;
          created_at?: string;
          day?: string;
          ends_at?: string | null;
          id?: string;
          reason?: string;
          staff_id?: string;
          starts_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "staff_time_off_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "business_branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_time_off_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      temporary_blocks: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string;
          ends_at: string;
          id: string;
          reason: string;
          staff_id: string | null;
          starts_at: string;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by: string;
          ends_at: string;
          id?: string;
          reason: string;
          staff_id?: string | null;
          starts_at: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string;
          ends_at?: string;
          id?: string;
          reason?: string;
          staff_id?: string | null;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "temporary_blocks_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "business_branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "temporary_blocks_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      waitlist_entries: {
        Row: {
          auto_book: boolean;
          booking_id: string | null;
          branch_id: string;
          business_id: string;
          created_at: string;
          customer_id: string;
          day: string;
          id: string;
          notified_at: string | null;
          require_confirmation: boolean;
          service_id: string;
          staff_id: string;
          status: Database["public"]["Enums"]["waitlist_status"];
          updated_at: string;
        };
        Insert: {
          auto_book?: boolean;
          booking_id?: string | null;
          branch_id: string;
          business_id: string;
          created_at?: string;
          customer_id: string;
          day: string;
          id?: string;
          notified_at?: string | null;
          require_confirmation?: boolean;
          service_id: string;
          staff_id: string;
          status?: Database["public"]["Enums"]["waitlist_status"];
          updated_at?: string;
        };
        Update: {
          auto_book?: boolean;
          booking_id?: string | null;
          branch_id?: string;
          business_id?: string;
          created_at?: string;
          customer_id?: string;
          day?: string;
          id?: string;
          notified_at?: string | null;
          require_confirmation?: boolean;
          service_id?: string;
          staff_id?: string;
          status?: Database["public"]["Enums"]["waitlist_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "business_branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waitlist_entries_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waitlist_entries_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waitlist_entries_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      account_balances: {
        Row: {
          account_ref: string | null;
          account_type: Database["public"]["Enums"]["ledger_account_type"] | null;
          balance: number | null;
          currency: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ledger_transactions_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
        ];
      };
    };
    Functions: {
      bump_slug_redirect_hit: {
        Args: { _old_slug: string };
        Returns: undefined;
      };
      check_login_throttle: {
        Args: { _email: string };
        Returns: {
          retry_after_seconds: number;
          throttled: boolean;
        }[];
      };
      check_promo_code: {
        Args: { _amount: number; _code: string; _salon_id: string };
        Returns: {
          discount: number;
          final_price: number;
          promotion_id: string;
          reason: string;
          valid: boolean;
        }[];
      };
      check_rate_limit: {
        Args: { _bucket: string; _max_hits: number; _window_minutes: number };
        Returns: boolean;
      };
      claim_notification_outbox_batch: {
        Args: { _batch_size?: number };
        Returns: {
          actor_id: string | null;
          attempts: number;
          booking_id: string | null;
          business_id: string | null;
          claimed_at: string | null;
          created_at: string;
          dedupe_key: string | null;
          event_type: string;
          id: string;
          last_error: string | null;
          next_attempt_at: string;
          payload: Json;
          payment_id: string | null;
          processed_at: string | null;
          status: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "notification_outbox";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      classify_email_domain: {
        Args: { _email: string };
        Returns: Database["public"]["Enums"]["email_domain_category"];
      };
      emit_notification_event: {
        Args: {
          _actor_id: string;
          _booking_id: string;
          _business_id: string;
          _dedupe_key?: string;
          _event_type: string;
          _payload?: Json;
          _payment_id: string;
        };
        Returns: string;
      };
      generate_booking_reference: { Args: never; Returns: string };
      generate_due_booking_reminders: { Args: never; Returns: number };
      get_available_slots: {
        Args: {
          _branch_id: string;
          _day: string;
          _service_id: string;
          _staff_id: string;
        };
        Returns: {
          available: boolean;
          slot: string;
        }[];
      };
      get_business_availability_summary: {
        Args: { _branch_id: string; _days?: number; _salon_id: string };
        Returns: {
          has_schedule: boolean;
          open_slots: number;
          service_id: string;
          staff_id: string;
        }[];
      };
      get_business_next_available: {
        Args: { _branch_id?: string; _business_id: string; _days?: number };
        Returns: {
          fully_booked_horizon: boolean;
          next_available_day: string;
        }[];
      };
      get_business_public_staff: {
        Args: { _salon_id: string };
        Returns: {
          avatar_url: string;
          created_at: string;
          full_name: string;
          full_name_ar: string;
          id: string;
          is_active: boolean;
          salon_id: string;
          service_ids: string[];
          title: string;
          title_ar: string;
          user_id: string;
        }[];
      };
      get_marketplace_readiness: {
        Args: { _salon_id: string };
        Returns: {
          future_availability: boolean;
          has_service: boolean;
          has_specialist: boolean;
          hours_set: boolean;
          location_set: boolean;
          logo_uploaded: boolean;
          profile_complete: boolean;
          service_assigned: boolean;
          working_hours_set: boolean;
        }[];
      };
      get_staff_day_availability: {
        Args: {
          _branch_id: string;
          _days?: number;
          _service_id: string;
          _staff_id: string;
        };
        Returns: {
          day: string;
          open_slots: number;
          status: string;
          total_slots: number;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_business_staff: {
        Args: { _staff_id: string; _user_id: string };
        Returns: boolean;
      };
      is_email_domain_allowed: { Args: { _email: string }; Returns: boolean };
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean };
      is_super_admin: { Args: { _user_id: string }; Returns: boolean };
      notify_booking_audience: {
        Args: {
          _body: string;
          _booking_id: string;
          _kind: string;
          _title: string;
        };
        Returns: undefined;
      };
      owns_business: {
        Args: { _salon_id: string; _user_id: string };
        Returns: boolean;
      };
      recompute_business_listing: {
        Args: { _salon_id: string };
        Returns: undefined;
      };
      record_login_attempt: { Args: { _email: string }; Returns: undefined };
      reschedule_booking: {
        Args: {
          _actor_id: string;
          _booking_id: string;
          _new_ends_at: string;
          _new_starts_at: string;
          _reason?: string;
        };
        Returns: {
          branch_id: string;
          business_id: string;
          confirmation_attempted_at: string | null;
          confirmation_notes: string | null;
          confirmation_status: Database["public"]["Enums"]["booking_confirmation_status"];
          confirmed_by: string | null;
          created_at: string;
          customer_email: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          discount_amount: number;
          ends_at: string;
          hold_expires_at: string | null;
          id: string;
          notes: string | null;
          original_price: number | null;
          paid_at: string | null;
          paid_by: string | null;
          payment_status: Database["public"]["Enums"]["payment_status"];
          promotion_id: string | null;
          reference: string;
          service_id: string;
          staff_id: string;
          starts_at: string;
          status: Database["public"]["Enums"]["booking_status"];
          total_price: number;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "bookings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      resolve_buffer_minutes: {
        Args: { _branch_id: string; _business_id: string; _service_id: string };
        Returns: number;
      };
      resolve_notification_outbox_event: {
        Args: { _error?: string; _id: string; _outcome: string };
        Returns: undefined;
      };
      search_businesses_page: {
        Args: {
          _category?: string;
          _city?: string;
          _country_code: string;
          _cursor_id?: string;
          _cursor_score?: number;
          _instant_only?: boolean;
          _lat?: number;
          _limit?: number;
          _lng?: number;
          _query?: string;
          _region_id?: string;
          _sort?: string;
          _verified_only?: boolean;
        };
        Returns: {
          area: string;
          categories: string[];
          city: string;
          cover_url: string;
          description: string;
          distance_km: number;
          district: string;
          id: string;
          image_url: string;
          instant_booking: boolean;
          is_verified: boolean;
          latitude: number;
          logo_url: string;
          longitude: number;
          name: string;
          name_ar: string;
          price_range: string;
          rank_score: number;
          rating: number;
          review_count: number;
          slug: string;
        }[];
      };
      submit_business_for_review: {
        Args: { _salon_id: string };
        Returns: {
          ok: boolean;
          reason: string;
        }[];
      };
      sweep_expired_holds: { Args: never; Returns: undefined };
    };
    Enums: {
      app_role: "client" | "business_owner" | "specialist" | "admin" | "super_admin";
      booking_confirmation_status:
        "not_required" | "pending" | "confirmed" | "unreachable" | "declined";
      booking_status:
        "pending" | "confirmed" | "completed" | "cancelled" | "held" | "expired" | "no_show";
      business_status: "pending" | "approved" | "rejected" | "suspended";
      email_domain_category:
        | "trusted_free_provider"
        | "business_domain"
        | "unknown_domain"
        | "disposable_email"
        | "blocked_domain"
        | "high_risk_domain";
      favorite_kind: "business" | "staff" | "service";
      ledger_account_type:
        | "customer_balance"
        | "business_balance"
        | "dallty_revenue"
        | "staff_payable"
        | "dallty_payable"
        | "refund_liability"
        | "promotional_credit"
        | "external_cash";
      ledger_direction: "debit" | "credit";
      marketplace_status: "draft" | "pending_review" | "approved" | "rejected" | "hidden";
      payment_status:
        | "unpaid"
        | "paid"
        | "refunded"
        | "payment_pending"
        | "deposit_required"
        | "deposit_pending"
        | "deposit_paid"
        | "partially_paid"
        | "payment_failed"
        | "payment_cancelled"
        | "refund_pending"
        | "partially_refunded";
      permission_scope: "global" | "country" | "business" | "branch" | "self";
      subscription_plan: "starter" | "professional" | "enterprise";
      waitlist_status: "waiting" | "notified" | "converted" | "cancelled";
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["client", "business_owner", "specialist", "admin", "super_admin"],
      booking_confirmation_status: [
        "not_required",
        "pending",
        "confirmed",
        "unreachable",
        "declined",
      ],
      booking_status: [
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "held",
        "expired",
        "no_show",
      ],
      business_status: ["pending", "approved", "rejected", "suspended"],
      email_domain_category: [
        "trusted_free_provider",
        "business_domain",
        "unknown_domain",
        "disposable_email",
        "blocked_domain",
        "high_risk_domain",
      ],
      favorite_kind: ["business", "staff", "service"],
      ledger_account_type: [
        "customer_balance",
        "business_balance",
        "dallty_revenue",
        "staff_payable",
        "dallty_payable",
        "refund_liability",
        "promotional_credit",
        "external_cash",
      ],
      ledger_direction: ["debit", "credit"],
      marketplace_status: ["draft", "pending_review", "approved", "rejected", "hidden"],
      payment_status: [
        "unpaid",
        "paid",
        "refunded",
        "payment_pending",
        "deposit_required",
        "deposit_pending",
        "deposit_paid",
        "partially_paid",
        "payment_failed",
        "payment_cancelled",
        "refund_pending",
        "partially_refunded",
      ],
      permission_scope: ["global", "country", "business", "branch", "self"],
      subscription_plan: ["starter", "professional", "enterprise"],
      waitlist_status: ["waiting", "notified", "converted", "cancelled"],
    },
  },
} as const;
