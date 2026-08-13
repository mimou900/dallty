export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string;
          actor_id: string;
          created_at: string;
          details: Json;
          id: string;
          target_id: string | null;
          target_type: string;
        };
        Insert: {
          action: string;
          actor_id: string;
          created_at?: string;
          details?: Json;
          id?: string;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          action?: string;
          actor_id?: string;
          created_at?: string;
          details?: Json;
          id?: string;
          target_id?: string | null;
          target_type?: string;
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
      bookings: {
        Row: {
          created_at: string;
          customer_id: string;
          discount_amount: number;
          ends_at: string;
          id: string;
          notes: string | null;
          original_price: number | null;
          paid_at: string | null;
          paid_by: string | null;
          payment_status: Database["public"]["Enums"]["payment_status"];
          promotion_id: string | null;
          salon_id: string;
          service_id: string;
          staff_id: string;
          starts_at: string;
          status: Database["public"]["Enums"]["booking_status"];
          total_price: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          customer_id: string;
          discount_amount?: number;
          ends_at: string;
          id?: string;
          notes?: string | null;
          original_price?: number | null;
          paid_at?: string | null;
          paid_by?: string | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          promotion_id?: string | null;
          salon_id: string;
          service_id: string;
          staff_id: string;
          starts_at: string;
          status?: Database["public"]["Enums"]["booking_status"];
          total_price?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          discount_amount?: number;
          ends_at?: string;
          id?: string;
          notes?: string | null;
          original_price?: number | null;
          paid_at?: string | null;
          paid_by?: string | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          promotion_id?: string | null;
          salon_id?: string;
          service_id?: string;
          staff_id?: string;
          starts_at?: string;
          status?: Database["public"]["Enums"]["booking_status"];
          total_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_promotion_id_fkey";
            columns: ["promotion_id"];
            isOneToOne: false;
            referencedRelation: "promotions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
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
      notifications: {
        Row: {
          body: string;
          booking_id: string | null;
          created_at: string;
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
          created_at?: string;
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
          created_at?: string;
          id?: string;
          kind?: string;
          read_at?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
          waitlist_id?: string | null;
        };
        Relationships: [];
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
      countries: {
        Row: {
          active: boolean;
          calling_code: string;
          created_at: string;
          currency_code: string;
          default_name: string;
          display_order: number;
          flag: string;
          id: string;
          iso_code: string;
          timezone: string;
          translations: Json;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          calling_code: string;
          created_at?: string;
          currency_code: string;
          default_name: string;
          display_order?: number;
          flag: string;
          id?: string;
          iso_code: string;
          timezone: string;
          translations?: Json;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          calling_code?: string;
          created_at?: string;
          currency_code?: string;
          default_name?: string;
          display_order?: number;
          flag?: string;
          id?: string;
          iso_code?: string;
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
          translations?: Json;
          updated_at?: string;
        };
        Relationships: [];
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
      profiles: {
        Row: {
          allergies: string | null;
          avatar_url: string | null;
          beauty_notes: string | null;
          birthday: string | null;
          country_code: string | null;
          created_at: string;
          favorite_categories: string[];
          full_name: string;
          gender: string | null;
          hair_type: string | null;
          id: string;
          locale: string;
          notify_email: boolean;
          notify_in_app: boolean;
          notify_sms: boolean;
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
          favorite_categories?: string[];
          full_name?: string;
          gender?: string | null;
          hair_type?: string | null;
          id: string;
          locale?: string;
          notify_email?: boolean;
          notify_in_app?: boolean;
          notify_sms?: boolean;
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
          favorite_categories?: string[];
          full_name?: string;
          gender?: string | null;
          hair_type?: string | null;
          id?: string;
          locale?: string;
          notify_email?: boolean;
          notify_in_app?: boolean;
          notify_sms?: boolean;
          phone?: string | null;
          skin_type?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      promotions: {
        Row: {
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
          salon_id: string;
          starts_at: string | null;
          updated_at: string;
          used_count: number;
        };
        Insert: {
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
          salon_id: string;
          starts_at?: string | null;
          updated_at?: string;
          used_count?: number;
        };
        Update: {
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
          salon_id?: string;
          starts_at?: string | null;
          updated_at?: string;
          used_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "promotions_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      recently_viewed: {
        Row: {
          id: string;
          salon_id: string;
          user_id: string;
          viewed_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          user_id: string;
          viewed_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          user_id?: string;
          viewed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recently_viewed_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
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
          created_at: string;
          customer_id: string;
          id: string;
          is_hidden: boolean;
          owner_replied_at: string | null;
          owner_reply: string | null;
          photos: string[];
          rating: number;
          report_count: number;
          salon_id: string;
          service_id: string | null;
          staff_id: string | null;
          updated_at: string;
        };
        Insert: {
          body?: string;
          booking_id?: string | null;
          created_at?: string;
          customer_id: string;
          id?: string;
          is_hidden?: boolean;
          owner_replied_at?: string | null;
          owner_reply?: string | null;
          photos?: string[];
          rating: number;
          report_count?: number;
          salon_id: string;
          service_id?: string | null;
          staff_id?: string | null;
          updated_at?: string;
        };
        Update: {
          body?: string;
          booking_id?: string | null;
          created_at?: string;
          customer_id?: string;
          id?: string;
          is_hidden?: boolean;
          owner_replied_at?: string | null;
          owner_reply?: string | null;
          photos?: string[];
          rating?: number;
          report_count?: number;
          salon_id?: string;
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
            foreignKeyName: "reviews_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
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
      salon_gallery: {
        Row: {
          before_url: string | null;
          caption: string | null;
          caption_ar: string | null;
          category: string;
          created_at: string;
          id: string;
          salon_id: string;
          sort_order: number;
          url: string;
        };
        Insert: {
          before_url?: string | null;
          caption?: string | null;
          caption_ar?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          salon_id: string;
          sort_order?: number;
          url: string;
        };
        Update: {
          before_url?: string | null;
          caption?: string | null;
          caption_ar?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          salon_id?: string;
          sort_order?: number;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "salon_gallery_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      salon_hours: {
        Row: {
          closes_at: string;
          created_at: string;
          id: string;
          is_closed: boolean;
          opens_at: string;
          salon_id: string;
          updated_at: string;
          weekday: number;
        };
        Insert: {
          closes_at?: string;
          created_at?: string;
          id?: string;
          is_closed?: boolean;
          opens_at?: string;
          salon_id: string;
          updated_at?: string;
          weekday: number;
        };
        Update: {
          closes_at?: string;
          created_at?: string;
          id?: string;
          is_closed?: boolean;
          opens_at?: string;
          salon_id?: string;
          updated_at?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "salon_hours_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      salons: {
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
          deposit_percent: number;
          description: string | null;
          description_ar: string | null;
          distance_km: number;
          district: string | null;
          employee_count: number | null;
          facebook_url: string | null;
          faq: Json;
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
          rejection_reason: string | null;
          require_deposit: boolean;
          review_count: number;
          reviewed_at: string | null;
          reviewed_by: string | null;
          seo_description: string | null;
          seo_keywords: string | null;
          seo_title: string | null;
          slot_interval_minutes: number;
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
          deposit_percent?: number;
          description?: string | null;
          description_ar?: string | null;
          distance_km?: number;
          district?: string | null;
          employee_count?: number | null;
          facebook_url?: string | null;
          faq?: Json;
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
          rejection_reason?: string | null;
          require_deposit?: boolean;
          review_count?: number;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          seo_description?: string | null;
          seo_keywords?: string | null;
          seo_title?: string | null;
          slot_interval_minutes?: number;
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
          deposit_percent?: number;
          description?: string | null;
          description_ar?: string | null;
          distance_km?: number;
          district?: string | null;
          employee_count?: number | null;
          facebook_url?: string | null;
          faq?: Json;
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
          rejection_reason?: string | null;
          require_deposit?: boolean;
          review_count?: number;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          seo_description?: string | null;
          seo_keywords?: string | null;
          seo_title?: string | null;
          slot_interval_minutes?: number;
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
        Relationships: [];
      };
      services: {
        Row: {
          category: string;
          cleanup_minutes: number;
          created_at: string;
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
          salon_id: string;
          tag: string | null;
          visibility: string;
        };
        Insert: {
          category?: string;
          cleanup_minutes?: number;
          created_at?: string;
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
          salon_id: string;
          tag?: string | null;
          visibility?: string;
        };
        Update: {
          category?: string;
          cleanup_minutes?: number;
          created_at?: string;
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
          salon_id?: string;
          tag?: string | null;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      staff: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          certificates: string[];
          created_at: string;
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
          salon_id: string;
          social_links: Json;
          title: string;
          title_ar: string | null;
          user_id: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          certificates?: string[];
          created_at?: string;
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
          salon_id: string;
          social_links?: Json;
          title?: string;
          title_ar?: string | null;
          user_id?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          certificates?: string[];
          created_at?: string;
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
          salon_id?: string;
          social_links?: Json;
          title?: string;
          title_ar?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "staff_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_breaks: {
        Row: {
          created_at: string;
          ends_at: string;
          id: string;
          label: string;
          staff_id: string;
          starts_at: string;
          weekday: number;
        };
        Insert: {
          created_at?: string;
          ends_at?: string;
          id?: string;
          label?: string;
          staff_id: string;
          starts_at?: string;
          weekday: number;
        };
        Update: {
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
          created_at: string;
          full_name: string;
          id: string;
          message: string | null;
          phone: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          salon_id: string;
          staff_id: string | null;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          full_name: string;
          id?: string;
          message?: string | null;
          phone?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          salon_id: string;
          staff_id?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          message?: string | null;
          phone?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          salon_id?: string;
          staff_id?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_join_requests_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
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
          created_at: string;
          custom_duration_minutes: number | null;
          custom_price: number | null;
          id: string;
          service_id: string;
          staff_id: string;
        };
        Insert: {
          created_at?: string;
          custom_duration_minutes?: number | null;
          custom_price?: number | null;
          id?: string;
          service_id: string;
          staff_id: string;
        };
        Update: {
          created_at?: string;
          custom_duration_minutes?: number | null;
          custom_price?: number | null;
          id?: string;
          service_id?: string;
          staff_id?: string;
        };
        Relationships: [
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
          created_at: string;
          day: string;
          id: string;
          reason: string;
          staff_id: string;
        };
        Insert: {
          created_at?: string;
          day: string;
          id?: string;
          reason?: string;
          staff_id: string;
        };
        Update: {
          created_at?: string;
          day?: string;
          id?: string;
          reason?: string;
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_time_off_staff_id_fkey";
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
          created_at: string;
          customer_id: string;
          day: string;
          id: string;
          notified_at: string | null;
          require_confirmation: boolean;
          salon_id: string;
          service_id: string;
          staff_id: string;
          status: Database["public"]["Enums"]["waitlist_status"];
          updated_at: string;
        };
        Insert: {
          auto_book?: boolean;
          booking_id?: string | null;
          created_at?: string;
          customer_id: string;
          day: string;
          id?: string;
          notified_at?: string | null;
          require_confirmation?: boolean;
          salon_id: string;
          service_id: string;
          staff_id: string;
          status?: Database["public"]["Enums"]["waitlist_status"];
          updated_at?: string;
        };
        Update: {
          auto_book?: boolean;
          booking_id?: string | null;
          created_at?: string;
          customer_id?: string;
          day?: string;
          id?: string;
          notified_at?: string | null;
          require_confirmation?: boolean;
          salon_id?: string;
          service_id?: string;
          staff_id?: string;
          status?: Database["public"]["Enums"]["waitlist_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
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
      [_ in never]: never;
    };
    Functions: {
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
      record_login_attempt: {
        Args: { _email: string };
        Returns: undefined;
      };
      get_available_slots: {
        Args: { _day: string; _service_id: string; _staff_id: string };
        Returns: {
          available: boolean;
          slot: string;
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
      get_salon_availability_summary: {
        Args: { _days?: number; _salon_id: string };
        Returns: {
          has_schedule: boolean;
          open_slots: number;
          service_id: string;
          staff_id: string;
        }[];
      };
      get_salon_public_staff: {
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
      get_staff_day_availability: {
        Args: { _days?: number; _service_id: string; _staff_id: string };
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
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean };
      is_salon_staff: {
        Args: { _staff_id: string; _user_id: string };
        Returns: boolean;
      };
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
      owns_salon: {
        Args: { _salon_id: string; _user_id: string };
        Returns: boolean;
      };
      recompute_salon_listing: {
        Args: { _salon_id: string };
        Returns: undefined;
      };
      submit_salon_for_review: {
        Args: { _salon_id: string };
        Returns: {
          ok: boolean;
          reason: string;
        }[];
      };
    };
    Enums: {
      app_role: "client" | "salon_owner" | "specialist" | "admin" | "super_admin";
      booking_status: "pending" | "confirmed" | "completed" | "cancelled";
      business_status: "pending" | "approved" | "rejected" | "suspended";
      favorite_kind: "salon" | "staff" | "service";
      marketplace_status: "draft" | "pending_review" | "approved" | "rejected" | "hidden";
      payment_status: "unpaid" | "paid" | "refunded";
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
  public: {
    Enums: {
      app_role: ["client", "salon_owner", "specialist", "admin", "super_admin"],
      booking_status: ["pending", "confirmed", "completed", "cancelled"],
      business_status: ["pending", "approved", "rejected", "suspended"],
      favorite_kind: ["salon", "staff", "service"],
      marketplace_status: ["draft", "pending_review", "approved", "rejected", "hidden"],
      payment_status: ["unpaid", "paid", "refunded"],
      subscription_plan: ["starter", "professional", "enterprise"],
      waitlist_status: ["waiting", "notified", "converted", "cancelled"],
    },
  },
} as const;
