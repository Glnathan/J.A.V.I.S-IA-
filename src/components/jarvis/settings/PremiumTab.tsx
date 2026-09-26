"use client";

import { CheckCircle2, Crown, Database, Download, ExternalLink, HardDriveDownload, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { SettingsPayload } from "@/lib/types";
import { PREMIUM_PRICE } from "@/lib/price";

interface UpdateCheck {
  current: string;
  latest: string | null;
  url: string | null;
  downloadUrl: string | null;
  notes: string | null;
}

interface BackupInfo {
  id: string;
  createdAt: number;
  size: number;
}

interface Props {
  payload: SettingsPayload;
  onSaved: (p: SettingsPayload) => void;
}

export default function PremiumTab({ payload, onSaved }: Props) {
  const premium = payload.settings.premiumActive;
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [check, setCheck] = useState<UpdateCheck | null>(null);

  const saveKey = async () => {
    setBusy("key");
    setMsg(null);
    try {
      // Activation en ligne : le service de licences délivre un jeton signé.
      const r = await fetch("/api/premium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; expires?: string; premiumActive?: boolean };
      if (!r.ok || !j.premiumActive) {
        setMsg({ ok: false, text: j.error ?? "Clé refusée par le service de licences." });
        return;
      }
      onSaved(j as SettingsPayload);
      setKey("");
      setMsg({ ok: true, text: "Bienvenue dans l'édition Premium ! Licence vérifiée et active." });
    } catch {
      setMsg({ ok: false, text: "Le serveur ne répond pas." });
    } finally {
      setBusy(null);
    }
  };

  const doCheck = async () => {
    setBusy("check");
    setMsg(null);
    try {
      const r = await fetch("/api/update", { cache: "no-store" });
      setCheck((await r.json()) as UpdateCheck);
    } catch {
      setMsg({ ok: false, text: "Vérification impossible (Internet ?)." });
    } finally {
      setBusy(null);
    }
  };

  // ─── Sauvegardes (Premium) ─────────────────────────────────────────────
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const loadBackups = async () => {
    try {
      const r = await fetch("/api/backup", { cache: "no-store" });
      if (r.ok) setBackups(((await r.json()) as { backups: BackupInfo[] }).backups);
    } catch {
      /* recharge à la prochaine ouverture */
    }
  };
  useEffect(() => {
    void loadBackups();
  }, []);

  const backupNow = async () => {
    setBusy("backup");
    setMsg(null);
    try {
      const r = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create" }) });
      const j = (await r.json().catch(() => ({}))) as BackupInfo & { error?: string };
      if (!r.ok || j.error) {
        setMsg({ ok: false, text: j.error ?? "Sauvegarde impossible." });
      } else {
        setMsg({ ok: true, text: `Sauvegarde ${j.id} créée.` });
        void loadBackups();
      }
    } catch {
      setMsg({ ok: false, text: "Le serveur ne répond pas." });
    } finally {
      setBusy(null);
    }
  };

  const restore = async (id: string) => {
    if (!window.confirm(`Restaurer la sauvegarde ${id} ?\nJ.A.R.V.I.S. redémarrera pour l'appliquer ; les données actuelles seront remplacées.`)) return;
    setBusy(`restore-${id}`);
    setMsg(null);
    try {
      const r = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", id }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || j.error) {
        setMsg({ ok: false, text: j.error ?? "Restauration impossible." });
        setBusy(null);
        return;
      }
      setMsg({ ok: true, text: "Restauration préparée. J.A.R.V.I.S. redémarre pour l'appliquer." });
      setTimeout(() => {
        void fetch("/api/desktop/quit", { method: "POST" }).catch(() => undefined);
      }, 2000);
    } catch {
      setMsg({ ok: false, text: "Le serveur ne répond pas." });
      setBusy(null);
    }
  };

  const fmtSize = (bytes: number) => (bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(1)} Go` : `${(bytes / 1048576).toFixed(1)} Mo`);
  const fmtDate = (ms: number) => new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

  const install = async () => {
    setBusy("install");
    try {
      const r = await fetch("/api/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "install" }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || j.error) {
        setMsg({ ok: false, text: j.error ?? "Installation impossible." });
        setBusy(null);
        return;
      }
      setMsg({ ok: true, text: "Mise à jour téléchargée. J.A.R.V.I.S. va redémarrer pour l'installer — l'installation est automatique." });
      setTimeout(() => {
        void fetch("/api/desktop/quit", { method: "POST" }).catch(() => undefined);
      }, 1500);
    } catch {
      setMsg({ ok: false, text: "Le serveur ne répond pas." });
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className={`rounded border p-4 ${premium ? "border-amber-400/40 bg-amber-400/5" : "border-hud/20 bg-hud/5"}`}>
        <div className="flex items-center gap-3">
          {premium ? <Crown size={18} className="text-amber-300" /> : <XCircle size={15} className="text-slate-400" />}
          <div>
            <div className="font-display text-sm tracking-[0.2em] text-white">{premium ? "ÉDITION PREMIUM" : "ÉDITION STANDARD"}</div>
            <p className="text-xs leading-relaxed text-slate-400">
              {premium
                ? "Merci de votre soutien ! Toutes les fonctions Premium sont actives sur ce J.A.R.V.I.S."
                : "Gratuite et complète. L'édition Premium ajoute les mises à jour automatiques et les services à venir."}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded border border-hud/15 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="label">Clé Premium</div>
          <span className="font-display text-sm tracking-[0.15em] text-amber-300">{PREMIUM_PRICE}</span>
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          Licence <b className="text-slate-200">à vie</b> : {PREMIUM_PRICE}, une seule fois. La clé est fournie par le créateur de J.A.R.V.I.S. après votre soutien —
          saisissez-la ci-dessous pour tout activer.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className="hud-field font-mono uppercase"
            placeholder={premium ? "Saisir une nouvelle clé pour la changer" : "JARVIS-XXXXX-XXXXX-XX"}
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
          />
          <button type="button" className="hud-btn shrink-0" onClick={() => void saveKey()} disabled={busy !== null || !key.trim()}>
            {busy === "key" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Activer
          </button>
        </div>
        {premium && (
          <div className="space-y-1">
            <p className="text-[11px] leading-snug text-slate-500">
              Licence vérifiée en ligne — valable jusqu&apos;au{" "}
              {payload.settings.premiumExpires ? new Date(payload.settings.premiumExpires).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "?"}
              , renouvelée automatiquement en arrière-plan.
            </p>
            <button
              type="button"
              className="text-xs text-red-300 underline underline-offset-2"
              onClick={() => {
                setKey("");
                void fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ premiumKey: "" }) })
                  .then((r) => r.json())
                  .then((p) => onSaved(p as SettingsPayload))
                  .catch(() => null);
              }}
            >
              Désactiver la licence
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded border border-hud/15 bg-black/20 p-4">
        <div className="flex items-center justify-between">
          <div className="label">Mises à jour</div>
          <button type="button" className="hud-btn !h-7" onClick={() => void doCheck()} disabled={busy !== null}>
            {busy === "check" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Rechercher
          </button>
        </div>
        {check === null ? (
          <p className="text-xs leading-relaxed text-slate-400">
            Version installée : <span className="font-mono text-hud">{payload.desktop.version}</span>. Les versions sont publiées sur GitHub.
          </p>
        ) : check.latest ? (
          <div className="space-y-2 text-sm">
            <p>
              Nouvelle version : <b className="text-white">{check.latest}</b> (installée : {check.current}).{" "}
              {premium ? "Installez-la en un clic — J.A.R.V.I.S. fait le reste." : "Ouvrez la page de la release pour la télécharger, ou passez en Premium pour l'installation automatique."}
            </p>
            {check.url && (
              <a href={check.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-hud underline underline-offset-2">
                Voir la release <ExternalLink size={11} />
              </a>
            )}
            {premium && (
              <button type="button" className="hud-btn" onClick={() => void install()} disabled={busy !== null || !check.downloadUrl}>
                {busy === "install" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Installer automatiquement
              </button>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-emerald-200">
            <CheckCircle2 size={14} /> J.A.R.V.I.S. est à jour ({check.current}).
          </p>
        )}
      </div>

      <div className="space-y-3 rounded border border-hud/15 bg-black/20 p-4">
        <div className="flex items-center justify-between">
          <div className="label flex items-center gap-2">
            <Database size={12} /> Sauvegardes
          </div>
          {premium && (
            <button type="button" className="hud-btn !h-7" onClick={() => void backupNow()} disabled={busy !== null}>
              {busy === "backup" ? <Loader2 size={12} className="animate-spin" /> : <HardDriveDownload size={12} />} Sauvegarder maintenant
            </button>
          )}
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          {premium
            ? "Vos données (mémoire, tâches, conversations, réglages) sont sauvegardées automatiquement chaque jour — les 7 dernières versions sont conservées."
            : "Sauvegarde quotidienne automatique et restauration en un clic : réservées à l'édition Premium."}
        </p>
        {premium && backups !== null && (
          <div className="space-y-1">
            {backups.length === 0 ? (
              <p className="font-mono text-xs text-slate-500">Aucune sauvegarde pour l&apos;instant — la première aura lieu aujourd&apos;hui.</p>
            ) : (
              <ul className="max-h-44 space-y-1 overflow-y-auto scroll-hud">
                {backups.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 rounded border border-hud/10 bg-black/20 px-2 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate font-mono text-slate-300">
                      {fmtDate(b.createdAt)} <span className="text-slate-500">· {fmtSize(b.size)}</span>
                    </span>
                    <button
                      type="button"
                      className="hud-btn !h-6 shrink-0 !text-[10px]"
                      onClick={() => void restore(b.id)}
                      disabled={busy !== null}
                    >
                      {busy === `restore-${b.id}` ? <Loader2 size={10} className="animate-spin" /> : null} Restaurer
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="rounded border border-hud/15 bg-black/20 p-4 text-xs leading-relaxed text-slate-400">
        <div className="label mb-2">Inclus dans Premium</div>
        <ul className="list-disc space-y-1 pl-4">
          <li>Mises à jour automatiques dès leur publication (installation silencieuse, sans clic)</li>
          <li>Mode Vision : caméra façon Iron Man, suivi des mouvements, reconnaissance faciale, vision de l&apos;écran par IA</li>
          <li>Visages de la famille : jusqu&apos;à 6 visages reconnus — chacun est salué par son prénom</li>
          <li>Prise de contrôle de l&apos;écran : « Jarvis, clique sur… » — il voit, propose, et agit après votre confirmation</li>
          <li>Conversation libre : « Jarvis, parlons » puis parlez sans mot d&apos;activation — votre voix seule est écoutée</li>
          <li>Mot d&apos;activation personnalisé : « Jarvis, réponds à Vendredi » — appelez-moi comme vous voulez</li>
          <li>Coffre Obsidian : « Jarvis, note dans Obsidian… » — vos notes Markdown, sur tous vos appareils</li>
          <li>Scan de sécurité : « Jarvis, lance un scan antivirus » — processus et démarrage analysés, rapport parlé</li>
          <li>Voix HD ElevenLabs : des réponses d&apos;un réalisme studio</li>
          <li>Transcription 100% locale : Whisper sur votre PC, l&apos;audio ne quitte jamais votre machine</li>
          <li>Apparences exclusives : « mode nanotech », « mode Ultron », « mode furtif »</li>
          <li>Sauvegarde quotidienne automatique, restauration en un clic</li>
          <li>Journal des connexions distantes (Paramètres → Mobile)</li>
          <li>Les services Premium à venir, inclus à vie</li>
        </ul>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-200" : "text-red-300"}`}>{msg.ok ? "✅ " : "❌ "}{msg.text}</p>}
    </div>
  );
}
