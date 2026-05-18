/**
 * DreamOS86 — Supabase Database Types
 *
 * Reflects the production schema in supabase/migrations/001_initial_schema.sql
 * Regenerate via: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PlanId = "free" | "pro" | "business" | "enterprise";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          email: string;
          full_name: string | null;
          username: string | null;
          avatar_url: string | null;
          plan_id: PlanId;
          plan_interval: "monthly" | "yearly";
          credits_remaining: number;
          credits_reset_at: string;
          onboarding_completed: boolean;
          onboarding_completed_at: string | null;
          default_model_id: string;
          use_case: string | null;
          experience_level: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          email_verified: boolean;
          terms_accepted_at: string | null;
          terms_version: string | null;
          terms_accepted_ip: string | null;
          is_admin: boolean | null;
          suspended_at: string | null;
          suspended_reason: string | null;
          referral_code: string | null;
          referred_by: string | null;
          total_referrals: number;
          workspace_name: string | null;
          workspace_icon_url: string | null;
          workspace_description: string | null;
          onboarding_answers: Json;
        };
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };

      groups: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          creator_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          category: string;
          icon_url: string | null;
          banner_color: string;
          is_public: boolean;
          is_featured: boolean;
          member_count: number;
        };
        Insert: Omit<Database["public"]["Tables"]["groups"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["groups"]["Row"]>;
        Relationships: [];
      };

      group_members: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          role: string;
          joined_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["group_members"]["Row"], "id" | "joined_at">;
        Update: Partial<Database["public"]["Tables"]["group_members"]["Row"]>;
        Relationships: [];
      };

      workspaces: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          owner_id: string;
          name: string;
          slug: string;
          avatar_url: string | null;
          plan_id: PlanId;
        };
        Insert: Omit<Database["public"]["Tables"]["workspaces"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["workspaces"]["Row"]>;
        Relationships: [];
      };

      team_members: {
        Row: {
          id: string;
          created_at: string;
          workspace_id: string;
          user_id: string | null;
          email: string;
          role: "owner" | "admin" | "editor" | "viewer";
          invited_by: string;
          status: "active" | "pending" | "removed";
          invite_token: string | null;
          invite_expires_at: string | null;
          accepted_at: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["team_members"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["team_members"]["Row"]>;
        Relationships: [];
      };

      subscriptions: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          stripe_subscription_id: string;
          stripe_customer_id: string;
          stripe_price_id: string;
          plan_id: PlanId;
          plan_interval: "monthly" | "yearly";
          credits_per_period: number;
          status: "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete";
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end: boolean;
          canceled_at: string | null;
          trial_end: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["subscriptions"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]>;
        Relationships: [];
      };

      credit_events: {
        Row: {
          id: string;
          created_at: string;
          user_id: string;
          project_id: string | null;
          conversation_id: string | null;
          operation_id: string;
          model_id: string;
          credits_consumed: number;
          internal_cost_usd: number;
          event_type: "generation" | "upload" | "deploy" | "grant" | "reset" | "refund";
          metadata: Json;
        };
        Insert: Omit<
          Database["public"]["Tables"]["credit_events"]["Row"],
          | "id"
          | "created_at"
          | "project_id"
          | "conversation_id"
          | "internal_cost_usd"
          | "metadata"
          | "event_type"
        > & {
          project_id?: string | null;
          conversation_id?: string | null;
          internal_cost_usd?: number;
          metadata?: Json;
          event_type?: Database["public"]["Tables"]["credit_events"]["Row"]["event_type"];
        };
        Update: never;
        Relationships: [];
      };

      conversations: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          title: string;
          model_id: string;
          pinned: boolean;
          archived: boolean;
          message_count: number;
          last_message_at: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["conversations"]["Row"],
          | "id"
          | "created_at"
          | "updated_at"
          | "pinned"
          | "archived"
          | "message_count"
          | "last_message_at"
          | "title"
          | "model_id"
        > & {
          title?: string;
          model_id?: string;
          pinned?: boolean;
          archived?: boolean;
          message_count?: number;
          last_message_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["conversations"]["Row"]>;
        Relationships: [];
      };

      messages: {
        Row: {
          id: string;
          created_at: string;
          conversation_id: string;
          user_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          model_id: string | null;
          credits_used: number;
          finish_reason: string | null;
          tokens_input: number | null;
          tokens_output: number | null;
          attachments: Json;
          metadata: Json;
        };
        Insert: Omit<
          Database["public"]["Tables"]["messages"]["Row"],
          | "id"
          | "created_at"
          | "credits_used"
          | "finish_reason"
          | "tokens_input"
          | "tokens_output"
          | "attachments"
          | "metadata"
        > & {
          credits_used?: number;
          finish_reason?: string | null;
          tokens_input?: number | null;
          tokens_output?: number | null;
          attachments?: Json;
          metadata?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Row"]>;
        Relationships: [];
      };

      projects: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          owner_id: string;
          workspace_id: string | null;
          name: string;
          description: string | null;
          slug: string;
          status: "live" | "staging" | "draft" | "building" | "error";
          framework: string;
          template_id: string | null;
          gradient: string;
          icon_url: string | null;
          preview_url: string | null;
          custom_domain: string | null;
          is_public: boolean;
          is_favorite: boolean;
          category: string | null;
          remix_of: string | null;
          remix_count: number;
          launch_count: number;
          metadata: Json;
        };
        Insert: Omit<Database["public"]["Tables"]["projects"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [];
      };

      templates: {
        Row: {
          id: string;
          created_at: string;
          name: string;
          description: string;
          category: string;
          gradient: string;
          accent: string;
          tags: string[];
          complexity: "simple" | "medium" | "advanced";
          popular: boolean;
          is_new: boolean;
          prompt: string;
          preview_url: string | null;
          uses_count: number;
          plan_required: PlanId | null;
        };
        Insert: Omit<Database["public"]["Tables"]["templates"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["templates"]["Row"]>;
        Relationships: [];
      };

      deployments: {
        Row: {
          id: string;
          created_at: string;
          project_id: string;
          user_id: string;
          status: "queued" | "building" | "deployed" | "failed" | "cancelled";
          environment: "production" | "staging" | "preview";
          url: string | null;
          build_duration_ms: number | null;
          commit_message: string | null;
          error_message: string | null;
          metadata: Json;
        };
        Insert: Omit<Database["public"]["Tables"]["deployments"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["deployments"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "deployments_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };

      media_assets: {
        Row: {
          id: string;
          created_at: string;
          user_id: string;
          project_id: string | null;
          filename: string;
          storage_path: string;
          public_url: string;
          mime_type: string;
          size_bytes: number;
          width: number | null;
          height: number | null;
          asset_type: "image" | "icon" | "screenshot" | "video" | "document";
          generated: boolean;
          generation_prompt: string | null;
          tags: string[];
        };
        Insert: Omit<
          Database["public"]["Tables"]["media_assets"]["Row"],
          | "id"
          | "created_at"
          | "project_id"
          | "width"
          | "height"
          | "generated"
          | "generation_prompt"
          | "tags"
          | "asset_type"
        > & {
          project_id?: string | null;
          width?: number | null;
          height?: number | null;
          generated?: boolean;
          generation_prompt?: string | null;
          tags?: string[];
          asset_type?: Database["public"]["Tables"]["media_assets"]["Row"]["asset_type"];
        };
        Update: Partial<Database["public"]["Tables"]["media_assets"]["Row"]>;
        Relationships: [];
      };

      api_keys: {
        Row: {
          id: string;
          created_at: string;
          user_id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
          scopes: string[];
          last_used_at: string | null;
          expires_at: string | null;
          revoked_at: string | null;
          request_count: number;
        };
        Insert: Omit<Database["public"]["Tables"]["api_keys"]["Row"], "id" | "created_at" | "last_used_at" | "revoked_at" | "request_count">;
        Update: Partial<Database["public"]["Tables"]["api_keys"]["Row"]>;
        Relationships: [];
      };

      analytics_events: {
        Row: {
          id: string;
          created_at: string;
          user_id: string;
          event_type: string;
          properties: Json;
          session_id: string | null;
          ip: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["analytics_events"]["Row"],
          "id" | "created_at" | "session_id" | "ip"
        > & {
          session_id?: string | null;
          ip?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["analytics_events"]["Row"]>;
        Relationships: [];
      };

      notifications: {
        Row: {
          id: string;
          created_at: string;
          user_id: string;
          type: "deploy" | "build" | "invite" | "credit" | "system" | "ai";
          title: string;
          body: string;
          read: boolean;
          action_url: string | null;
          metadata: Json;
        };
        Insert: Omit<
          Database["public"]["Tables"]["notifications"]["Row"],
          "id" | "created_at" | "read" | "metadata"
        > & {
          read?: boolean;
          metadata?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
        Relationships: [];
      };

      user_settings: {
        Row: {
          user_id: string;
          updated_at: string;
          theme: "system" | "dark" | "light";
          default_model_id: string;
          notification_prefs: Json;
          editor_prefs: Json;
          billing_alerts: boolean;
          marketing_emails: boolean;
        };
        Insert: Pick<Database["public"]["Tables"]["user_settings"]["Row"], "user_id"> &
          Partial<
            Omit<
              Database["public"]["Tables"]["user_settings"]["Row"],
              "user_id" | "updated_at"
            >
          >;
        Update: Partial<Database["public"]["Tables"]["user_settings"]["Row"]>;
        Relationships: [];
      };

      support_tickets: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          subject: string;
          body: string;
          status: "open" | "in_progress" | "resolved" | "closed";
          category: string;
          priority: "low" | "normal" | "high" | "urgent";
          attachments: Json;
          admin_note: string | null;
          resolved_at: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["support_tickets"]["Row"],
          | "id"
          | "created_at"
          | "updated_at"
          | "status"
          | "attachments"
          | "admin_note"
          | "resolved_at"
        > & {
          status?: Database["public"]["Tables"]["support_tickets"]["Row"]["status"];
          attachments?: Json;
          admin_note?: string | null;
          resolved_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["support_tickets"]["Row"]>;
        Relationships: [];
      };

      ticket_replies: {
        Row: {
          id: string;
          created_at: string;
          ticket_id: string;
          user_id: string;
          body: string;
          is_staff: boolean;
          attachments: Json;
        };
        Insert: Omit<
          Database["public"]["Tables"]["ticket_replies"]["Row"],
          "id" | "created_at" | "attachments"
        > & { attachments?: Json };
        Update: Partial<Database["public"]["Tables"]["ticket_replies"]["Row"]>;
        Relationships: [];
      };

      onboarding: {
        Row: {
          user_id: string;
          created_at: string;
          completed_at: string | null;
          workspace_name: string | null;
          use_case: string | null;
          experience_level: string | null;
          preferred_model: string | null;
          referral_source: string | null;
          answers: Json;
        };
        Insert: Omit<Database["public"]["Tables"]["onboarding"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["onboarding"]["Row"]>;
        Relationships: [];
      };

      referrals: {
        Row: {
          id: string;
          created_at: string;
          referrer_id: string;
          referred_id: string;
          code: string;
          status: "pending" | "qualified" | "rewarded" | "fraud";
          rewarded_at: string | null;
          reward_kind: "credits" | "plan_days" | "feature_unlock" | null;
          reward_amount: number | null;
          attribution: Json;
        };
        Insert: Omit<
          Database["public"]["Tables"]["referrals"]["Row"],
          "id" | "created_at" | "rewarded_at" | "reward_kind" | "reward_amount" | "attribution"
        > & {
          rewarded_at?: string | null;
          reward_kind?: "credits" | "plan_days" | "feature_unlock" | null;
          reward_amount?: number | null;
          attribution?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["referrals"]["Row"]>;
        Relationships: [];
      };

      referral_codes: {
        Row: {
          user_id: string;
          code: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["referral_codes"]["Row"], "created_at"> & {
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["referral_codes"]["Row"]>;
        Relationships: [];
      };

      project_memory: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          project_id: string;
          user_id: string;
          category:
            | "architecture"
            | "visual_identity"
            | "code_evolution"
            | "deployment"
            | "preferences"
            | "workflow"
            | "components"
            | "design_system"
            | "intent"
            | "file_relationships";
          key: string;
          value: Json;
          importance: number;
        };
        Insert: Omit<
          Database["public"]["Tables"]["project_memory"]["Row"],
          "id" | "created_at" | "updated_at" | "importance"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          importance?: number;
        };
        Update: Partial<Database["public"]["Tables"]["project_memory"]["Row"]>;
        Relationships: [];
      };

      billing_events: {
        Row: {
          id: string;
          created_at: string;
          user_id: string | null;
          stripe_event_id: string;
          event_type: string;
          amount_usd: number | null;
          currency: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          metadata: Json;
        };
        Insert: Omit<
          Database["public"]["Tables"]["billing_events"]["Row"],
          "id" | "created_at" | "currency" | "metadata"
        > & {
          currency?: string | null;
          metadata?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["billing_events"]["Row"]>;
        Relationships: [];
      };

      discussions: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          title: string;
          body: string;
          category: "General" | "Tips" | "Guide" | "Feedback" | "Showcase" | "Question" | "Announcement";
          reply_count: number;
          like_count: number;
          is_pinned: boolean;
          is_deleted: boolean;
        };
        Insert: Omit<Database["public"]["Tables"]["discussions"]["Row"], "id" | "created_at" | "updated_at" | "reply_count" | "like_count" | "is_pinned" | "is_deleted"> & {
          reply_count?: number;
          like_count?: number;
          is_pinned?: boolean;
          is_deleted?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["discussions"]["Row"]>;
        Relationships: [];
      };

      discussion_replies: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          discussion_id: string;
          user_id: string;
          body: string;
          like_count: number;
          is_deleted: boolean;
        };
        Insert: Omit<Database["public"]["Tables"]["discussion_replies"]["Row"], "id" | "created_at" | "updated_at" | "like_count" | "is_deleted"> & {
          like_count?: number;
          is_deleted?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["discussion_replies"]["Row"]>;
        Relationships: [];
      };

      discussion_likes: {
        Row: {
          user_id: string;
          discussion_id: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["discussion_likes"]["Row"], "created_at">;
        Update: never;
        Relationships: [];
      };

      audit_logs: {
        Row: {
          id: string;
          created_at: string;
          actor_id: string | null;
          target_id: string | null;
          action: string;
          details: Json;
          ip: string | null;
          user_agent: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["audit_logs"]["Row"],
          "id" | "created_at" | "ip" | "user_agent"
        >;
        Update: never;
        Relationships: [];
      };

      admin_actions: {
        Row: {
          id: string;
          created_at: string;
          admin_id: string;
          target_id: string;
          action_type: string;
          amount: number | null;
          reason: string | null;
          otp_verified: boolean;
          metadata: Json;
        };
        Insert: Omit<Database["public"]["Tables"]["admin_actions"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["admin_actions"]["Row"]>;
        Relationships: [];
      };
    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      consume_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_operation_id: string;
          p_model_id: string;
          p_project_id?: string;
          p_conversation_id?: string;
        };
        Returns: { success: boolean; remaining: number; error: string | null };
      };
      grant_credits: {
        Args: {
          p_admin_id: string;
          p_user_id: string;
          p_amount: number;
          p_reason: string;
        };
        Returns: { success: boolean; error: string | null };
      };
      get_user_credit_summary: {
        Args: { p_user_id: string };
        Returns: {
          total_used: number;
          total_granted: number;
          remaining: number;
          reset_at: string;
        };
      };
      ensure_referral_code: {
        Args: { p_user_id: string };
        Returns: string;
      };
      claim_referral_reward: {
        Args: { p_referred_id: string; p_credits?: number };
        Returns: {
          success: boolean;
          credits_granted?: number;
          error?: string;
        };
      };
    };

    Enums: {
      plan_id: PlanId;
    };
  };
}

// Convenience type aliases
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Profile = Tables<"profiles">;
export type Workspace = Tables<"workspaces">;
export type TeamMember = Tables<"team_members">;
export type Subscription = Tables<"subscriptions">;
export type CreditEvent = Tables<"credit_events">;
export type Conversation = Tables<"conversations">;
export type Message = Tables<"messages">;
export type Project = Tables<"projects">;
export type Template = Tables<"templates">;
export type Deployment = Tables<"deployments">;
export type MediaAsset = Tables<"media_assets">;
export type ApiKey = Tables<"api_keys">;
export type AnalyticsEvent = Tables<"analytics_events">;
export type Notification = Tables<"notifications">;
export type UserSettings = Tables<"user_settings">;
export type SupportTicket = Tables<"support_tickets">;
export type TicketReply = Tables<"ticket_replies">;
export type Onboarding = Tables<"onboarding">;
export type Referral = Tables<"referrals">;
export type BillingEvent = Tables<"billing_events">;
export type AuditLog = Tables<"audit_logs">;
export type AdminAction = Tables<"admin_actions">;
export type Discussion = Tables<"discussions">;
export type DiscussionReply = Tables<"discussion_replies">;
export type DiscussionLike = Tables<"discussion_likes">;
