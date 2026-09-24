ALTER TABLE "settings" ALTER COLUMN "boot_music" SET DEFAULT 'youtube';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "boot_music_url" text DEFAULT 'https://www.youtube.com/watch?v=v2AC41dglnM' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "boot_music_start" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "boot_music_duration" real DEFAULT 30 NOT NULL;