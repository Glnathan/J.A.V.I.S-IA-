"use client";

import { CheckCircle2, Calendar, ExternalLink, Loader2, Mail, Maximize2, RefreshCw, Search, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Code } from "./ui";

interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
  snippet: string;
}

interface AgendaEvent {
  id: string;
  title: string;
  start: string;
  allDay: boolean;
  location: string;
}

interface GmailStatus {
  configured: boolean;
  connected: boolean;
  agenda?: boolean;
  credentialsPath: string;
}

export default function GmailTab() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [query, setQuery] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/gmail?action=status", { cache: "no-store" });
      if (r.ok) setStatus((await r.json()) as GmailStatus);
    } catch {
      /* hors ligne */
    }
  }, []);

  const loadMails = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/gmail?action=list&max=50", { cache: "no-store" });
      const j = (await r.json()) as { messages?: GmailMessage[]; error?: string };
      if (!r.ok || j.error) setError(j.error ?? "Erreur Gmail");
      else setMessages(j.messages ?? []);
    } catch {
      setError("Le serveur ne répond pas.");
    } finally {
      setBusy(false);
    }
  }, []);

  const loadAgenda = useCallback(async () => {
    if (!status?.agenda) return;
    try {
      const r = await fetch("/api/gmail?action=agenda&max=6", { cache: "no-store" });
      const j = (await r.json()) as { events?: AgendaEvent[] };
      if (r.ok) setEvents(j.events ?? []);
    } catch {
      /* hors ligne */
    }
  }, [status?.agenda]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status?.connected) void loadMails();
    if (status?.agenda) void loadAgenda();
  }, [status?.connected, status?.agenda, loadMails, loadAgenda]);

  const connect = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/gmail?action=url", { cache: "no-store" });
      const j = (await r.json()) as { url?: string; error?: string };
      if (j.url) window.open(j.url, "_blank", "noopener");
      else setError(j.error ?? "credentials.json introuvable.");
    } catch {
      setError("Le serveur ne répond pas.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await fetch("/api/gmail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect" }) }).catch(() => null);
    setMessages([]);
    await loadStatus();
  };

  const filtered = messages
    .filter((m) => (onlyUnread ? m.unread : true))
    .filter((m) => {
      const q = query.trim().toLowerCase();
      return !q || m.subject.toLowerCase().includes(q) || m.from.toLowerCase().includes(q);
    });
  const unread = messages.filter((m) => m.unread).length;

  if (!status) {
    return (
      <div className="grid place-items-center py-10 text-slate-400">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className={`rounded border p-3 text-sm ${status.connected ? "border-emerald-400/30 bg-emerald-400/5" : "border-hud/20 bg-hud/5"}`}>
        <span className="flex flex-wrap items-center gap-2">
          {status.connected ? <CheckCircle2 size={15} className="text-emerald-400" /> : <XCircle size={15} className="text-amber-400" />}
          {status.connected ? (
            <>
              Gmail connecté · {unread} non lu{unread > 1 ? "s" : ""} parmi les {messages.length} derniers
              <button type="button" className="hud-btn !h-7 ml-auto" onClick={() => void disconnect()}>
                Déconnecter
              </button>
            </>
          ) : status.configured ? (
            <>
              credentials.json détecté — cliquez pour autoriser J.A.R.V.I.S. à lire vos mails
              <button type="button" className="hud-btn !h-7 ml-auto" onClick={() => void connect()} disabled={busy}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} Connecter Gmail
              </button>
            </>
          ) : (
            <>Gmail n'est pas encore configuré — suivez les étapes ci-dessous.</>
          )}
        </span>
      </div>

      {status.connected && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-40 flex-1">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-hud/60" />
              <input
                className="hud-field !pl-9 text-sm"
                placeholder="Rechercher dans les 50 derniers mails…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button type="button" className="hud-btn" data-active={onlyUnread} onClick={() => setOnlyUnread((v) => !v)}>
              Non lus
            </button>
            <button type="button" className="hud-btn" onClick={() => void loadMails()} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Actualiser
            </button>
            <button type="button" className="hud-btn" onClick={() => window.open("/mails", "_blank", "noopener")} title="Fenêtre agrandie, redimensionnable et plein écran (F11)">
              <Maximize2 size={13} /> Ouvrir en grand
            </button>
          </div>
          {error && <p className="text-sm text-red-300">⚠️ {error}</p>}
          <div className="scroll-hud max-h-[46dvh] space-y-2 overflow-y-auto pr-1">
            {filtered.map((m) => (
              <div key={m.id} className={`rounded border p-3 text-sm ${m.unread ? "border-hud/40 bg-hud/10" : "border-hud/15 bg-black/20"}`}>
                <div className="flex items-center gap-2">
                  {m.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-hud shadow-[0_0_6px_var(--hud)]" title="Non lu" />}
                  <span className="min-w-0 flex-1 truncate font-medium text-white">{m.subject}</span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-500">{m.date}</span>
                </div>
                <div className="mt-0.5 text-xs text-hud">{m.from}</div>
                {m.snippet && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">{m.snippet}</p>}
              </div>
            ))}
            {!filtered.length && <p className="py-6 text-center text-sm text-slate-500">Aucun mail à afficher.</p>}
          </div>
        </div>
      )}

      {status.connected && (
        <div className="rounded border border-hud/15 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="label flex items-center gap-2">
              <Calendar size={13} /> Prochains rendez-vous
            </span>
            {status.agenda ? (
              <button type="button" className="hud-btn !h-7" onClick={() => void loadAgenda()}>
                <RefreshCw size={12} />
              </button>
            ) : (
              <button type="button" className="hud-btn !h-7" onClick={() => void connect()}>
                Activer l'agenda
              </button>
            )}
          </div>
          {status.agenda ? (
            events.length ? (
              <ul className="space-y-1.5 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-hud">
                      {new Date(e.start).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", ...(e.allDay ? {} : { hour: "2-digit", minute: "2-digit" }) })}
                    </span>
                    <span className="text-slate-100">{e.title}</span>
                    {e.location && <span className="text-xs text-slate-500">{e.location}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Aucun rendez-vous à venir.</p>
            )
          ) : (
            <p className="text-xs leading-relaxed text-slate-400">
              L'agenda demande une autorisation supplémentaire : cliquez « Activer l'agenda », Google vous demandera de confirmer, puis dites
              « Jarvis, quel est mon prochain rendez-vous ? ».
            </p>
          )}
        </div>
      )}

      {!status.configured && (
        <div className="space-y-4 rounded border border-hud/15 bg-black/20 p-4 text-sm leading-relaxed text-slate-300">
          <p>
            Pour la <b className="text-white">lecture vocale de vos mails</b> (« Lis mes mails », « Ai-je des mails non lus ? »), générez votre
            fichier <span className="font-mono text-hud">credentials.json</span> depuis Google Cloud Console :
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Créez un projet sur{" "}
              <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-hud underline underline-offset-2">
                Google Cloud Console <ExternalLink size={11} />
              </a>{" "}
              et activez l'API <b className="text-white">Gmail API</b>.
            </li>
            <li>
              Créez des identifiants OAuth de type <b className="text-white">Application de bureau</b> (OAuth client ID).
            </li>
            <li>
              Téléchargez le fichier JSON, renommez-le précisément <span className="font-mono text-hud">credentials.json</span> et placez-le dans
              le dossier de données de J.A.R.V.I.S. :
            </li>
          </ol>
          <Code>{status.credentialsPath}</Code>
          <p className="text-xs text-slate-400">
            Revenez ensuite ici et cliquez « Connecter Gmail » : Google vous demandera d'autoriser J.A.R.V.I.S. une seule fois. Les clés ne
            quittent jamais votre PC ; seule la lecture est autorisée (Gmail API en lecture seule).
          </p>
        </div>
      )}
    </div>
  );
}
