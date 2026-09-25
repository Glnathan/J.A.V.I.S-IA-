"use client";

import {
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  House,
  KeyRound,
  Mic,
  Monitor,
  Power,
  Puzzle,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { DownloadItem, SettingsPayload } from "@/lib/types";
import { CompactDownloadButton, InstallerDownloads } from "./DownloadButtons";
import { Card, Code, Toggle } from "./ui";

interface Props {
  payload: SettingsPayload;
  canInstall: boolean;
  onInstall: () => void;
  pcControl: boolean;
  onPcControl: (v: boolean) => void;
  onQuit: () => void;
}

type BadgeTone = "required" | "included" | "free" | "paid" | "optional" | "done";

function Badge({ children, tone = "optional" }: { children: ReactNode; tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    required: "border-cyan-300/40 bg-cyan-400/15 text-cyan-100",
    included: "border-emerald-400/35 bg-emerald-400/10 text-emerald-100",
    free: "border-sky-400/35 bg-sky-400/10 text-sky-100",
    paid: "border-amber-400/35 bg-amber-400/10 text-amber-100",
    optional: "border-white/15 bg-white/5 text-slate-300",
    done: "border-emerald-300/40 bg-emerald-400/15 text-emerald-50",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${tones[tone]}`}>
      {children}
    </span>
  );
}

function SetupCard({
  step,
  title,
  badge,
  badgeTone = "optional",
  children,
  accent = false,
}: {
  step?: string;
  title: string;
  badge?: string;
  badgeTone?: BadgeTone;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex h-full flex-col gap-3 rounded-2xl border p-4 shadow-[0_0_24px_rgb(0_0_0/0.25)] ${
        accent ? "border-hud/45 bg-gradient-to-br from-hud/15 via-black/30 to-black/50" : "border-hud/20 bg-[#04101c]/90"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {step && <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-hud/70">{step}</div>}
          <div className="text-sm font-semibold tracking-wide text-white">{title}</div>
        </div>
        {badge && <Badge tone={badgeTone}>{badge}</Badge>}
      </div>
      <div className="flex flex-1 flex-col gap-3 text-sm leading-relaxed text-slate-300">{children}</div>
    </div>
  );
}

function GhostLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-hud/25 bg-black/30 px-4 py-2.5 text-xs text-slate-100 transition hover:border-hud/50 hover:bg-hud/10"
    >
      {children}
    </a>
  );
}

function KeyField({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-[11px] text-slate-400">
      <span className="text-hud">{label}</span>
      <span className="text-slate-600">=</span>
      <span className="text-slate-500">{placeholder}</span>
    </div>
  );
}

export default function InstallTab({ payload, canInstall, onInstall, pcControl, onPcControl, onQuit }: Props) {
  const [downloads, setDownloads] = useState<DownloadItem[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scan, setScan] = useState<{ busy: boolean; text?: string }>({ busy: false });
  const runScan = async () => {
    setScan({ busy: true });
    try {
      const r = await fetch("/api/security", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { error?: string; ok?: boolean; totalProcesses?: number; processes?: string[]; startups?: string[] };
      if (j.error) setScan({ busy: false, text: `✗ ${j.error}` });
      else if (j.ok) {
        const nb = (j.processes?.length ?? 0) + (j.startups?.length ?? 0);
        setScan({
          busy: false,
          text: nb
            ? `⚠ ${nb} élément(s) à vérifier — ${[...(j.processes ?? []), ...(j.startups ?? [])].slice(0, 5).map((x) => x.split("|")[0]).join(", ")}`
            : `✓ Aucune anomalie : ${j.totalProcesses} processus analysés, démarrage propre.`,
        });
      } else setScan({ busy: false, text: "✗ Analyse impossible." });
    } catch {
      setScan({ busy: false, text: "✗ Analyse impossible (serveur injoignable)." });
    }
  };
  const desktop = payload.desktop;
  const ai = payload.ai;
  const home = payload.home;
  const stt = payload.stt;

  useEffect(() => {
    let alive = true;
    fetch("/api/download", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<DownloadItem[]>) : []))
      .then((d) => {
        if (alive) setDownloads(d);
      })
      .catch(() => {
        if (alive) setDownloads([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const installer = downloads?.find((d) => d.kind === "installer");
  const source = downloads?.find((d) => d.kind === "source");

  const openPlugins = async () => {
    const r = await fetch("/api/plugins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "open" }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setNotice(j.error ?? null);
  };

  return (
    <div className="space-y-6">
      {desktop.enabled ? (
        <SetupCard step="Option B · active" title={`J.A.R.V.I.S. ${desktop.version} tourne sur votre PC`} badge="Installé" badgeTone="done" accent>
          <p className="flex items-center gap-2 text-emerald-200">
            <Monitor size={15} /> Version PC complète : base embarquée, Python intégré, contrôle local.
          </p>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <div className="label mb-1 !text-[9px]">Plugins Python</div>
              <Code>{desktop.pluginsDir}</Code>
            </div>
            <div>
              <div className="label mb-1 !text-[9px]">Données (mémoire, tâches…)</div>
              <Code>{desktop.dataDir ?? "—"}</Code>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="hud-btn" onClick={() => void openPlugins()}>
              <FolderOpen size={14} /> Ouvrir le dossier des plugins
            </button>
            <button type="button" className="hud-btn !text-red-300" onClick={onQuit}>
              <Power size={14} /> Quitter J.A.R.V.I.S.
            </button>
          </div>
          {notice && <p className="text-xs text-amber-200">{notice}</p>}
          <p className="text-xs text-slate-400">
            JARVIS s&apos;arrête tout seul 5 minutes après la fermeture de sa fenêtre. Vous pouvez aussi dire « Jarvis, éteins-toi ».
          </p>
        </SetupCard>
      ) : (
        <>
          <div className="rounded-2xl border border-hud/35 bg-gradient-to-br from-hud/10 via-black/40 to-black/60 p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="required">Option B</Badge>
              <Badge tone="included">Recommandée</Badge>
              <Badge tone="free">Tout-en-un</Badge>
            </div>
            <h2 className="glow-text font-display text-xl tracking-[0.18em] text-hud">Installer J.A.R.V.I.S. sur Windows</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              On reste sur l&apos;<b className="text-white">option B</b> : un vrai logiciel Windows. Un seul fichier{" "}
              <span className="font-mono text-hud">.exe</span> installe le moteur, la base de données embarquée, Python pour les plugins et le lanceur. Aucun
              droit administrateur n&apos;est requis.
            </p>
            <div className="mt-4">
              {installer ? (
                <InstallerDownloads installer={installer} source={source} />
              ) : (
                <p className="text-sm text-amber-200">{downloads === null ? "Recherche de l'installateur…" : "L'installateur n'a pas encore été généré."}</p>
              )}
            </div>
            <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-300">
              <li>Double-cliquez sur le fichier .exe.</li>
              <li>
                Si Windows affiche « Windows a protégé votre ordinateur » :{" "}
                <b className="text-white">Informations complémentaires → Exécuter quand même</b>.
              </li>
              <li>Indiquez votre prénom, la musique de démarrage, puis lancez JARVIS depuis le bureau.</li>
              <li>Autorisez le microphone au premier lancement (ou utilisez le diagnostic 🩺).</li>
            </ol>
            <p className="mt-3 flex items-start gap-2 text-xs text-slate-400">
              <ShieldAlert size={13} className="mt-0.5 shrink-0" />
              Les réglages de la version en ligne ne sont pas repris : la version PC a sa propre mémoire, uniquement sur votre ordinateur.
            </p>
          </div>

          <div>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <div className="label">Étape 1 · Environnement PC</div>
                <p className="mt-1 text-xs text-slate-400">Avec l&apos;option B, ces briques sont déjà dans l&apos;installateur. Rien d&apos;autre à télécharger pour démarrer.</p>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <SetupCard step="1 · Python 3.12" title="Python pour les plugins" badge="Inclus dans le .exe" badgeTone="included">
                <p>
                  Interprète utilisé par vos plugins JARVIS. <span className="text-amber-200">Pas besoin d&apos;installer Python 3.13+</span> : la version embarquée
                  suffit.
                </p>
                <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                  Optionnel : si vous installez Python vous-même, cochez <b>Add Python to PATH</b> en bas de la première fenêtre.
                </div>
                <GhostLink href="https://www.python.org/downloads/release/python-31210/">
                  <Download size={14} /> Télécharger Python 3.12 <ExternalLink size={12} />
                </GhostLink>
              </SetupCard>

              <SetupCard step="2 · Node.js & npm" title="Runtime applicatif" badge="Inclus dans le .exe" badgeTone="included">
                <p>Orchestre le serveur local, l&apos;interface HUD et les routes API de JARVIS. L&apos;installateur embarque déjà Node.js.</p>
                <p className="text-xs text-slate-400">Utile seulement si vous rebuild l&apos;installateur avec <span className="font-mono text-hud">construire-exe.bat</span>.</p>
                <GhostLink href="https://nodejs.org/en/download">
                  <Download size={14} /> Télécharger Node.js (LTS) <ExternalLink size={12} />
                </GhostLink>
              </SetupCard>

              <SetupCard step="3 · Fenêtre applicative" title="Chrome / Edge (fenêtre JARVIS)" badge="Déjà sur Windows" badgeTone="included">
                <p>
                  JARVIS s&apos;ouvre dans une fenêtre Chrome ou Edge dédiée : micro, voix naturelles et reconnaissance vocale inclus. Aucun WebView2 séparé n&apos;est
                  requis pour l&apos;option B.
                </p>
                <GhostLink href="https://www.google.com/chrome/">
                  <Download size={14} /> Télécharger Chrome <ExternalLink size={12} />
                </GhostLink>
              </SetupCard>

              <SetupCard step="4 · Micro & plugins" title="Capture vocale et extensions" badge="Prêt" badgeTone="included">
                <p>
                  Le micro passe par le navigateur (et Whisper en secours). Les plugins Python vivent dans votre dossier{" "}
                  <span className="font-mono text-hud">JARVIS\plugins</span>.
                </p>
                <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-[11px] text-slate-300">
                  <div className="text-slate-500"># optionnel, Python système seulement</div>
                  <div className="text-hud">pip install pyaudio</div>
                </div>
              </SetupCard>
            </div>
          </div>
        </>
      )}

      <div>
        <div className="mb-3">
          <div className="label">Étape 2 · Cerveaux IA</div>
          <p className="mt-1 text-xs text-slate-400">
            Une clé suffit pour des conversations illimitées. Les clés se collent ensuite dans <b className="text-slate-200">Paramètres → Intelligence</b>
            {stt.available ? " (Whisper déjà prêt)." : " ou Voix & micro pour Whisper."}
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <SetupCard step="Gemini AI" title="Google Gemini" badge="Gratuit & recommandé" badgeTone="free" accent={!ai.active}>
            <p>Cerveau principal gratuit, réactif, sans carte bancaire. Idéal pour démarrer.</p>
            <KeyField label="GEMINI_API_KEY" placeholder="votre_clé_ici" />
            <GhostLink href="https://aistudio.google.com/apikey">
              <Sparkles size={14} /> Obtenir ma clé Gemini <ExternalLink size={12} />
            </GhostLink>
          </SetupCard>

          <SetupCard step="Groq Cloud" title="Groq" badge="Gratuit & ultra rapide" badgeTone="free" accent={!ai.active}>
            <p>Inférence ultra-rapide, parfaite pour les réponses vocales. La même clé sert aussi au moteur Whisper.</p>
            <KeyField label="GROQ_API_KEY" placeholder="votre_clé_ici" />
            <GhostLink href="https://console.groq.com/keys">
              <Zap size={14} /> Obtenir ma clé Groq <ExternalLink size={12} />
            </GhostLink>
          </SetupCard>

          <SetupCard step="Claude AI" title="Anthropic (Claude)" badge="Payant (crédits)" badgeTone="paid">
            <p>Raisonnement avancé pour les demandes complexes. Compte Anthropic requis.</p>
            <KeyField label="ANTHROPIC_API_KEY" placeholder="votre_clé_ici" />
            <GhostLink href="https://console.anthropic.com/settings/keys">
              <KeyRound size={14} /> Obtenir ma clé Claude <ExternalLink size={12} />
            </GhostLink>
          </SetupCard>

          <SetupCard step="Local / premium" title="Ollama · OpenAI · autres" badge="Au choix" badgeTone="optional">
            <p>
              <b className="text-white">Ollama</b> : 100 % local et privé. OpenAI, Mistral, OpenRouter et DeepSeek se branchent aussi dans Intelligence.
            </p>
            <div className="flex flex-wrap gap-2">
              <GhostLink href="https://ollama.com/download">
                <Download size={14} /> Ollama <ExternalLink size={12} />
              </GhostLink>
              <GhostLink href="https://platform.openai.com/api-keys">
                OpenAI <ExternalLink size={12} />
              </GhostLink>
            </div>
          </SetupCard>
        </div>
        {ai.active && (
          <p className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 size={14} /> Noyau déjà connecté : {ai.label}
            {ai.model ? ` · ${ai.model}` : ""}
          </p>
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label">Étape 3 · Voix, domotique & outils connectés</div>
            <p className="mt-1 text-xs text-slate-400">Ces services se configurent dans JARVIS. Aucun n&apos;est obligatoire pour parler et piloter le PC.</p>
          </div>
          <Badge tone="optional">Services connectés</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SetupCard title="Voix & micro" badge="Intégré" badgeTone="included">
            <p className="text-xs">Voix du navigateur + Whisper (Groq) en secours. Diagnostic micro via l&apos;icône 🩺.</p>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Mic size={13} className="text-hud" /> {stt.available ? "Whisper prêt" : "Navigateur / Whisper optionnel"}
            </div>
          </SetupCard>
          <SetupCard title="Home Assistant" badge={home.configured ? "Connecté" : "Pilotage domotique"} badgeTone={home.configured ? "done" : "optional"}>
            <p className="text-xs">Lumières, volets, chauffage, scènes. Adresse + jeton longue durée dans Maison.</p>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <House size={13} className="text-hud" /> {home.configured ? "Maison prête" : "Paramètres → Maison"}
            </div>
          </SetupCard>
          <SetupCard title="Plugins Python" badge="Extensible" badgeTone="optional">
            <p className="text-xs">Ajoutez vos commandes vocales sans recompiler. Rechargement immédiat.</p>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Puzzle size={13} className="text-hud" /> Dossier JARVIS\plugins
            </div>
          </SetupCard>
          <SetupCard title="Musique & web" badge="Intégré" badgeTone="included">
            <p className="text-xs">Thunderstruck au démarrage, YouTube, météo, actualités, Wikipédia : déjà dans JARVIS.</p>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Zap size={13} className="text-hud" /> Aucune clé YouTube requise
            </div>
          </SetupCard>
        </div>
      </div>

      <div>
        <div className="mb-3">
          <div className="label">Étape 4 · Accès mobile & dépannage</div>
          <p className="mt-1 text-xs text-slate-400">
            L&apos;option B ouvre JARVIS sur le PC. Pour le piloter depuis un téléphone hors Wi‑Fi, un tunnel privé type Tailscale reste la voie la plus saine.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <SetupCard step="Téléphone" title="JARVIS Mobile (4G / 5G / Wi‑Fi)" badge="Onglet Mobile" badgeTone="free" accent>
            <p className="text-xs">
              Tout est dans l&apos;onglet <b className="text-white">Mobile</b> : tutoriel Tailscale en 4 étapes, code PIN, publication HTTPS automatique et QR code à scanner.
            </p>
            <ul className="list-disc space-y-1 pl-4 text-xs">
              <li>Tailscale : accès de partout, chiffré, micro OK (HTTPS).</li>
              <li>Wi‑Fi local : même réseau, sans micro (HTTP).</li>
            </ul>
            <Code>{"https://mon-pc.tail12345.ts.net"}</Code>
          </SetupCard>

          <SetupCard step="Dépannage" title="Un problème au premier démarrage ?" badge="Antigravity" badgeTone="optional">
            <p className="text-xs">
              Si le lancement échoue, ouvrez le code source avec Antigravity et demandez à l&apos;agent de lire le journal{" "}
              <span className="font-mono text-hud">%APPDATA%\JARVIS\logs\jarvis.log</span>.
            </p>
            <div className="flex flex-wrap gap-2">
              <GhostLink href="https://antigravity.google/">
                <Download size={14} /> Télécharger Antigravity <ExternalLink size={12} />
              </GhostLink>
              {source && <CompactDownloadButton item={source} />}
            </div>
          </SetupCard>

          <SetupCard step="Dev" title="Modifier JARVIS ensuite" badge="Python / Antigravity" badgeTone="optional">
            <ul className="list-disc space-y-1.5 pl-4 text-xs">
              <li>
                Plugins sans recompiler : dossier <span className="font-mono text-hud">plugins</span>.
              </li>
              <li>
                Tests en direct : <span className="font-mono text-hud">demarrer-dev.bat</span>
              </li>
              <li>
                Nouvel installateur : <span className="font-mono text-hud">construire-exe.bat</span>
              </li>
            </ul>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Terminal size={13} className="text-hud" /> Node.js 20+ seulement pour rebuild
            </div>
          </SetupCard>
        </div>
      </div>

      <Card title="Contrôle du PC">
        <Toggle
          checked={pcControl}
          onChange={onPcControl}
          label="Autoriser JARVIS à ouvrir des applications"
          desc="Calculatrice, bloc-notes, explorateur, dossiers, verrouillage de session… (liste blanche sécurisée)."
        />
        <p className={`text-xs ${payload.pc.available ? "text-emerald-300" : "text-amber-300"}`}>
          {payload.pc.available
            ? `✅ Disponible : JARVIS tourne sur cet ordinateur (${payload.pc.platform}).`
            : "⚠️ Indisponible ici : cette version tourne sur un serveur distant. Installez la version PC (option B) pour contrôler votre ordinateur."}
        </p>
      </Card>

      {!desktop.enabled && canInstall && (
        <Card title="Option A · simple raccourci web">
          <p className="text-sm text-slate-300">
            Moins puissante que l&apos;option B : ajoute seulement la version en ligne au bureau. Pas de contrôle PC, pas de plugins locaux.
          </p>
          <button type="button" className="hud-btn" onClick={onInstall}>
            <Download size={14} /> Ajouter le raccourci web
          </button>
        </Card>
      )}

      <Card title="Sécurité du système (Premium, version PC)">
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          Analyse PowerShell native : processus actifs exécutés depuis des dossiers à risque (Temp, Téléchargements…)
          et entrées de démarrage suspectes du registre. Rien n&apos;est supprimé — JARVIS vous rapporte, vous décidez.
          À la voix aussi : « Jarvis, lance un scan antivirus ».
        </p>
        <button type="button" className="hud-btn" onClick={() => void runScan()} disabled={scan.busy || !payload.settings.premiumActive}>
          <ShieldAlert size={14} /> {scan.busy ? "Analyse en cours…" : "Lancer un scan antivirus"}
        </button>
        {scan.text && <p className="mt-2 text-xs text-slate-300">{scan.text}</p>}
      </Card>

      {!desktop.enabled && (
        <div className="flex items-start gap-3 rounded-2xl border border-hud/20 bg-black/30 p-4 text-xs leading-relaxed text-slate-400">
          <Smartphone size={16} className="mt-0.5 shrink-0 text-hud" />
          <div>
            <b className="text-slate-200">Rappel option B :</b> tout ce qui compte pour un JARVIS de bureau est dans le fichier{" "}
            <span className="font-mono text-hud">.exe</span>. Les cartes Python / Node / WebView ci-dessus restent visibles pour coller à votre idée d&apos;installation,
            mais elles ne sont <b className="text-slate-200">pas obligatoires</b> si vous utilisez l&apos;installateur tout-en-un.
          </div>
        </div>
      )}
    </div>
  );
}
