"use client";

import { Loader2, Mail, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
  snippet: string;
}

export default function MailsPage() {
  const [messages, setMessages] = useState<GmailMessage[] | null>(null);
  const [selected, setSelected] = useState<GmailMessage | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/gmail?action=list&max=25", { cache: "no-store" });
      const j = (await r.json()) as { messages?: GmailMessage[]; error?: string };
      if (!r.ok || j.error) setError(j.error ?? "Erreur Gmail");
      else setMessages(j.messages ?? []);
    } catch {
      setError("Le serveur ne répond pas.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    document.title = "J.A.R.V.I.S. — Mails";
    void load();
  }, [load]);

  const open = async (m: GmailMessage) => {
    setSelected(m);
    setBody(null);
    try {
      const r = await fetch(`/api/gmail?action=read&id=${encodeURIComponent(m.id)}`, { cache: "no-store" });
      const j = (await r.json()) as { body?: string; error?: string };
      setBody(j.body || j.error || "(mail sans texte)");
    } catch {
      setBody("Lecture impossible.");
    }
  };

  const filtered = (messages ?? [])
    .filter((m) => (onlyUnread ? m.unread : true))
    .filter((m) => {
      const q = query.trim().toLowerCase();
      return !q || m.subject.toLowerCase().includes(q) || m.from.toLowerCase().includes(q);
    });
  const unread = (messages ?? []).filter((m) => m.unread).length;

  return (
    <div className="hud-bg min-h-dvh text-slate-100">
      <div className="hud-grid pointer-events-none fixed inset-0" />
      <div className="scanlines pointer-events-none fixed inset-0" />
      <div className="vignette pointer-events-none fixed inset-0" />

      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-center gap-3">
          <span className="glow-text font-display text-sm tracking-[0.3em] text-hud">J.A.R.V.I.S. — MAILS</span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            {messages ? `${messages.length} derniers · ${unread} non lus` : "chargement…"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative min-w-44 flex-1 sm:max-w-80">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-hud/60" />
              <input
                className="hud-field !pl-9 text-sm"
                placeholder="Recherche en temps réel…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button type="button" className="hud-btn" data-active={onlyUnread} onClick={() => setOnlyUnread((v) => !v)}>
              Non lus
            </button>
            <button type="button" className="hud-btn" onClick={() => void load()} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            </button>
          </div>
        </header>

        {error && <p className="rounded border border-red-400/30 bg-red-400/5 p-3 text-sm text-red-200">⚠️ {error}</p>}

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="scroll-hud hud-panel max-h-[80dvh] space-y-2 overflow-y-auto p-3">
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => void open(m)}
                className={`block w-full rounded border p-3 text-left text-sm transition ${selected?.id === m.id ? "border-hud bg-hud/15" : m.unread ? "border-hud/40 bg-hud/10 hover:border-hud/60" : "border-hud/15 bg-black/20 hover:border-hud/40"}`}
              >
                <span className="flex items-center gap-2">
                  {m.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-hud shadow-[0_0_6px_var(--hud)]" />}
                  <span className="min-w-0 flex-1 truncate font-medium text-white">{m.subject}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-hud">{m.from}</span>
                <span className="mt-1 block truncate text-xs text-slate-500">
                  {m.date} {m.snippet && `— ${m.snippet}`}
                </span>
              </button>
            ))}
            {!filtered.length && (
              <p className="grid h-32 place-items-center text-sm text-slate-500">{messages ? "Aucun mail à afficher." : <Loader2 size={16} className="animate-spin" />}</p>
            )}
          </div>

          <div className="hud-panel max-h-[80dvh] overflow-hidden p-0">
            {selected ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="border-b border-hud/15 p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-semibold text-white">{selected.subject}</h2>
                      <p className="mt-1 text-xs text-hud">
                        {selected.from} <span className="text-slate-500">· {selected.date}</span>
                      </p>
                    </div>
                    <button type="button" className="hud-btn !h-8 !w-8 shrink-0 !p-0" onClick={() => setSelected(null)} title="Fermer">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="scroll-hud min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-relaxed text-slate-200">
                  {body === null ? (
                    <p className="grid h-24 place-items-center text-slate-500">
                      <Loader2 size={16} className="animate-spin" />
                    </p>
                  ) : (
                    <p className="whitespace-pre-wrap">{body}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid h-full place-items-center p-8 text-center text-sm text-slate-500">
                <div>
                  <Mail size={24} className="mx-auto mb-3 text-hud/50" />
                  Sélectionnez un mail pour le lire ici.
                  <br />
                  <span className="text-xs text-slate-600">Astuce : F11 pour le plein écran, et redimensionnez la fenêtre à votre guise.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
