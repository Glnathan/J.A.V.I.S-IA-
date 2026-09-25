"use client";

import { Brain, Check, Crown, House, Loader2, Mail, Mic, Monitor, Puzzle, Smartphone, User, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { SettingsPayload } from "@/lib/types";
import AITab, { type TestState } from "./settings/AITab";
import { formFromSettings, type SetField, type SettingsForm } from "./settings/form";
import GmailTab from "./settings/GmailTab";
import HomeTab from "./settings/HomeTab";
import InstallTab from "./settings/InstallTab";
import MobileTab from "./settings/MobileTab";
import PluginsTab from "./settings/PluginsTab";
import PremiumTab from "./settings/PremiumTab";
import ProfileTab from "./settings/ProfileTab";
import VoiceTab from "./settings/VoiceTab";

export type SettingsTab = "profile" | "voice" | "ai" | "mail" | "home" | "plugins" | "premium" | "mobile" | "install";

interface Props {
  payload: SettingsPayload;
  voices: SpeechSynthesisVoice[];
  canInstall: boolean;
  initialTab: SettingsTab;
  onInstall: () => void;
  onClose: () => void;
  onSaved: (p: SettingsPayload) => void;
  onTestVoice: (opts: { voiceName: string; rate: number; pitch: number; text?: string }) => void;
  /** Libère le micro (arrête l'écoute permanente) avant une prise de voix — jamais deux micros à la fois. */
  onMicNeeded: () => void;
  onClearData: (kind: "history" | "memories" | "tasks") => void;
  onQuit: () => void;
}

const TABS: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: "profile", label: "Profil", icon: <User size={14} /> },
  { id: "voice", label: "Voix & micro", icon: <Mic size={14} /> },
  { id: "ai", label: "Intelligence", icon: <Brain size={14} /> },
  { id: "mail", label: "Mails", icon: <Mail size={14} /> },
  { id: "home", label: "Maison", icon: <House size={14} /> },
  { id: "plugins", label: "Plugins Python", icon: <Puzzle size={14} /> },
  { id: "premium", label: "Premium", icon: <Crown size={14} /> },
  { id: "mobile", label: "Mobile", icon: <Smartphone size={14} /> },
  { id: "install", label: "Installation", icon: <Monitor size={14} /> },
];

const JSON_HEADERS = { "Content-Type": "application/json" };
const NO_SECRETS = { sttApiKey: "", haToken: "" };

export default function SettingsModal({ payload, voices, canInstall, initialTab, onInstall, onClose, onSaved, onTestVoice, onMicNeeded, onClearData, onQuit }: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [form, setForm] = useState<SettingsForm>(() => formFromSettings(payload.settings));
  const [secrets, setSecrets] = useState(NO_SECRETS);
  const [aiKeyDrafts, setAiKeyDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [aiTest, setAiTest] = useState<TestState>({ loading: false });
  const [haTest, setHaTest] = useState<TestState>({ loading: false });

  const set: SetField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setSecret = (key: keyof typeof NO_SECRETS, value: string) => setSecrets((s) => ({ ...s, [key]: value }));
  const setKeyDraft = (id: string, value: string) => setAiKeyDrafts((d) => ({ ...d, [id]: value }));

  const put = async (body: Record<string, unknown>): Promise<SettingsPayload | null> => {
    const r = await fetch("/api/settings", { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(body) });
    if (!r.ok) return null;
    const p = (await r.json()) as SettingsPayload;
    onSaved(p);
    return p;
  };

  const save = async (): Promise<SettingsPayload | null> => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...form };
      const keys = Object.fromEntries(Object.entries(aiKeyDrafts).filter(([, v]) => v.trim()));
      if (Object.keys(keys).length) body.aiKeys = keys;
      for (const [k, v] of Object.entries(secrets)) if (v.trim()) body[k] = v.trim();
      const p = await put(body);
      if (p) {
        setSecrets(NO_SECRETS);
        setAiKeyDrafts({});
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
      }
      return p;
    } catch {
      return null;
    } finally {
      setSaving(false);
    }
  };

  const clearSecret = (flag: "clearSttKey" | "clearHaToken") => void put({ [flag]: true }).catch(() => null);
  const clearAiKey = (id: string) => void put({ clearAiKey: id }).catch(() => null);

  const runTest = async (setState: (s: TestState) => void, url: string, body?: unknown) => {
    setState({ loading: true });
    const p = await save();
    if (!p) {
      setState({ loading: false, ok: false, message: "Impossible d'enregistrer les paramètres." });
      return;
    }
    try {
      const r = await fetch(url, { method: "POST", headers: JSON_HEADERS, body: body ? JSON.stringify(body) : undefined });
      const j = (await r.json()) as { ok: boolean; message: string };
      setState({ loading: false, ok: j.ok, message: j.message });
    } catch {
      setState({ loading: false, ok: false, message: "Erreur réseau." });
    }
  };

  const refreshPayload = async () => {
    try {
      const r = await fetch("/api/settings", { cache: "no-store" });
      if (!r.ok) return;
      const p = (await r.json()) as SettingsPayload;
      onSaved(p);
      set("bootMusic", p.settings.bootMusic);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="hud-panel fade-in relative z-10 flex max-h-[92dvh] w-[min(96vw,820px)] flex-col !bg-[#030b14]/95 md:w-[min(96vw,940px)]">
        <div className="flex items-center justify-between border-b border-hud/15 px-5 py-4">
          <div>
            <div className="glow-text font-display text-sm tracking-[0.3em] text-hud">PARAMÈTRES</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Configuration de J.A.R.V.I.S. {payload.desktop.version}</div>
          </div>
          <button type="button" className="hud-btn" onClick={onClose} title="Fermer">
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            className="scroll-hud flex shrink-0 gap-1 overflow-x-auto border-b border-hud/10 px-3 py-2 md:w-48 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:border-b-0 md:border-r md:border-hud/15 md:px-3 md:py-4"
            aria-label="Sections des paramètres"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`hud-btn shrink-0 !justify-start md:w-full ${tab === t.id ? "shadow-[0_0_14px_rgb(var(--hud-rgb)/0.3)]" : ""}`}
                data-active={tab === t.id}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </nav>

          <div className="scroll-hud min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {tab === "profile" && (
            <ProfileTab
              form={form}
              set={set}
              desktop={payload.desktop.enabled}
              onPreview={(text) => onTestVoice({ voiceName: form.voiceName, rate: form.voiceRate, pitch: form.voicePitch, text })}
              onClearData={onClearData}
            />
          )}
          {tab === "voice" && (
            <VoiceTab
              form={form}
              set={set}
              payload={payload}
              voices={voices}
              sttKey={secrets.sttApiKey}
              setSttKey={(v) => setSecret("sttApiKey", v)}
              onClearSttKey={() => clearSecret("clearSttKey")}
              onTestVoice={onTestVoice}
              onMicNeeded={onMicNeeded}
              onBootMusicChanged={refreshPayload}
            />
          )}
          {tab === "ai" && (
            <AITab
              form={form}
              set={set}
              payload={payload}
              keyDrafts={aiKeyDrafts}
              setKeyDraft={setKeyDraft}
              onClearKey={clearAiKey}
              onProviderChange={(id) => {
                setForm((f) => ({ ...f, aiProvider: id, aiModel: "", aiBaseUrl: "" }));
                setAiTest({ loading: false });
              }}
              onTest={() => void runTest(setAiTest, "/api/settings/test")}
              test={aiTest}
              saving={saving}
            />
          )}
          {tab === "mail" && <GmailTab />}
          {tab === "home" && (
            <HomeTab
              form={form}
              set={set}
              payload={payload}
              token={secrets.haToken}
              setToken={(v) => setSecret("haToken", v)}
              onClearToken={() => clearSecret("clearHaToken")}
              onTest={() => void runTest(setHaTest, "/api/home", { action: "test" })}
              test={haTest}
              saving={saving}
            />
          )}
          {tab === "plugins" && <PluginsTab enabled={form.pluginsEnabled} onToggle={(v) => set("pluginsEnabled", v)} desktop={payload.desktop.enabled} />}
          {tab === "premium" && <PremiumTab payload={payload} onSaved={onSaved} />}
          {tab === "mobile" && <MobileTab payload={payload} />}
          {tab === "install" && (
            <InstallTab payload={payload} canInstall={canInstall} onInstall={onInstall} pcControl={form.pcControl} onPcControl={(v) => set("pcControl", v)} onQuit={onQuit} />
          )}
        </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-hud/15 px-5 py-3">
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-300">
              <Check size={14} /> Enregistré
            </span>
          )}
          <button type="button" className="hud-btn" onClick={onClose}>
            Fermer
          </button>
          <button type="button" className="hud-btn" data-active="true" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
