CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text DEFAULT 'Nouvelle conversation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"source" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"user_name" text DEFAULT '' NOT NULL,
	"honorific" text DEFAULT 'Monsieur' NOT NULL,
	"city" text DEFAULT 'Paris' NOT NULL,
	"voice_name" text DEFAULT '' NOT NULL,
	"voice_rate" real DEFAULT 1.05 NOT NULL,
	"voice_pitch" real DEFAULT 0.9 NOT NULL,
	"auto_speak" boolean DEFAULT true NOT NULL,
	"wake_word" boolean DEFAULT false NOT NULL,
	"ai_provider" text DEFAULT 'auto' NOT NULL,
	"ai_model" text DEFAULT '' NOT NULL,
	"ai_api_key" text DEFAULT '' NOT NULL,
	"ai_base_url" text DEFAULT '' NOT NULL,
	"pc_control" boolean DEFAULT true NOT NULL,
	"boot_music" text DEFAULT 'theme' NOT NULL,
	"boot_volume" real DEFAULT 0.8 NOT NULL,
	"plugins_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"due_at" timestamp with time zone,
	"notified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");