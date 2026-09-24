ALTER TABLE "settings" ADD COLUMN "address_by" text DEFAULT 'name' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "onboarded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "stt_engine" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "stt_provider" text DEFAULT 'groq' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "stt_api_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "desktop_browser" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ha_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ha_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ha_token" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ha_use_assist" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ha_allow_sensitive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ha_favorites" text DEFAULT '[]' NOT NULL;