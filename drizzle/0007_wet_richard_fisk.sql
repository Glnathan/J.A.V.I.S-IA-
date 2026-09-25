ALTER TABLE "settings" ADD COLUMN "voice_print" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "voice_gate" boolean DEFAULT false NOT NULL;