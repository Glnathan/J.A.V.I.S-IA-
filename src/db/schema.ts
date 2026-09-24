import { boolean, index, integer, jsonb, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { MessageMeta } from "../lib/types";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("Nouvelle conversation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    source: text("source"),
    meta: jsonb("meta").$type<MessageMeta>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId)],
);

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
  dueAt: timestamp("due_at", { withTimezone: true }),
  notified: boolean("notified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memories = pgTable("memories", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  userName: text("user_name").notNull().default(""),
  honorific: text("honorific").notNull().default("Monsieur"),
  city: text("city").notNull().default("Paris"),
  voiceName: text("voice_name").notNull().default(""),
  voiceRate: real("voice_rate").notNull().default(1.05),
  voicePitch: real("voice_pitch").notNull().default(0.9),
  autoSpeak: boolean("auto_speak").notNull().default(true),
  wakeWord: boolean("wake_word").notNull().default(false),
  aiProvider: text("ai_provider").notNull().default("auto"),
  aiModel: text("ai_model").notNull().default(""),
  aiApiKey: text("ai_api_key").notNull().default(""),
  aiBaseUrl: text("ai_base_url").notNull().default(""),
  /** Une clé par fournisseur (JSON : { "groq": "…", "gemini": "…" }) — installateur et Paramètres > Intelligence. */
  aiKeys: text("ai_keys").notNull().default("{}"),
  /** Clé de licence J.A.R.V.I.S. Premium (vide = édition Standard). */
  premiumKey: text("premium_key").notNull().default(""),
  pcControl: boolean("pc_control").notNull().default(true),
  // "youtube" (Thunderstruck par défaut, lecteur YouTube officiel) | "custom" (fichier de l'utilisateur) | "theme" | "off"
  bootMusic: text("boot_music").notNull().default("youtube"),
  bootMusicUrl: text("boot_music_url").notNull().default("https://www.youtube.com/watch?v=v2AC41dglnM"),
  bootMusicStart: real("boot_music_start").notNull().default(0),
  /** Secondes de lecture avant le fondu final (0 = morceau entier). */
  bootMusicDuration: real("boot_music_duration").notNull().default(30),
  bootVolume: real("boot_volume").notNull().default(0.8),
  pluginsEnabled: boolean("plugins_enabled").notNull().default(true),
  // v1.2 — profil, reconnaissance vocale, fenêtre PC, Home Assistant
  addressBy: text("address_by").notNull().default("name"),
  onboarded: boolean("onboarded").notNull().default(false),
  sttEngine: text("stt_engine").notNull().default("auto"),
  sttProvider: text("stt_provider").notNull().default("groq"),
  sttApiKey: text("stt_api_key").notNull().default(""),
  desktopBrowser: text("desktop_browser").notNull().default("auto"),
  haEnabled: boolean("ha_enabled").notNull().default(false),
  haUrl: text("ha_url").notNull().default(""),
  haToken: text("ha_token").notNull().default(""),
  haUseAssist: boolean("ha_use_assist").notNull().default(true),
  haAllowSensitive: boolean("ha_allow_sensitive").notNull().default(false),
  haFavorites: text("ha_favorites").notNull().default("[]"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
