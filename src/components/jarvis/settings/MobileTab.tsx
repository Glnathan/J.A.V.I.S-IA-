"use client";

import { CheckCircle2, ExternalLink, KeyRound, Loader2, RefreshCw, Smartphone, Wifi, XCircle } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { RemotePayload } from "@/app/api/remote/route";
import type { SettingsPayload } from "@/lib/types";
import { Code } from "./ui";

interface Props {
  payload: SettingsPayload;
}

type Tone = "free" | "required" | "info" | "ok";

function Pill({ children, tone = "info" }: { children: ReactNode; tone?: Tone }) {
  const cls: Record<Tone, string> = {
    free: "border-sky-400/40 bg-sky-400/10 text-sky-100",
    required: "border-amber-400/40 bg-amber-400/10 text-amber-100",
    info: "border-hud/35 bg-hud/10 text-hud",
    ok: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] ${cls[tone]}`}>{children}</span>;
}

function Step({ n, title, pill, tone, children, done }: { n: number; title: string; pill: string; tone: Tone; children: ReactNode; done?: boolean }) {
  return (
    <div className={`flex h-full flex-col gap-3 rounded-2xl border p-4 ${done ? "border-emerald-400/35 bg-emerald-400/5" : "border-hud/20 bg-[#04101c]/90"}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-hud/40 bg-hud/10 font-display text-sm text-hud">{done ? "✓" : n}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold uppercase tracking-wide text-white">{title}</div>
        </div>
        <Pill tone={done ? "ok" : tone}>{done ? "Fait" : pill}</Pill>
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-slate-300">{children}</div>
    </div>
  );
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-hud underline underline-offset-2">
      👉 {children} <ExternalLink size={11} />
    </a>
  );
}

function Check({ ok, label, hint }: { ok: boolean | null; label: string; hint?: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok === null ? <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-hud" /> : ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" /> : <XCircle size={15} className="mt-0.5 shrink-0 text-amber-400" />}
      <span>
        <span className="text-slate-100">{label}</span>
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </span>
    </li>
  );
}

export default function MobileTab({ payload }: Props) {
  const desktop = payload.desktop.enabled;
  const [data, setData] = useState<RemotePayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/remote", { cache: "no-store" });
      if (r.ok) setData((await r.json()) as RemotePayload);
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setMsg(null);
    try {
      const r = await fetch("/api/remote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as Partial<RemotePayload> & { error?: string; ok?: boolean; message?: string; payload?: RemotePayload };
      if (!r.ok || j.error) {
        setMsg({ ok: false, text: j.error ?? j.message ?? "Erreur" });
        return;
      }
      if (j.payload) setData(j.payload);
      else if (typeof j.mode === "string") setData(j as RemotePayload);
      if (typeof j.message === "string") setMsg({ ok: Boolean(j.ok), text: j.message });
      if (label === "pin") {
        setPin("");
        setMsg({ ok: true, text: "Code PIN enregistré." });
      }
      if (label === "serve") void load();
    } catch {
      setMsg({ ok: false, text: "Le serveur ne répond pas." });
    } finally {
      setBusy(null);
    }
  };

  const ts = data?.tailscale ?? null;
  const mode = data?.mode ?? "off";
  const connectedRecently = data?.remoteSeenAt ? Date.now() - Date.parse(data.remoteSeenAt) < 2 * 60000 : false;
  const address = data?.url ?? (ts?.dnsName ? `https://${ts.dnsName}/` : null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Smartphone size={18} className="text-hud" /> TUTO : Connecter votre téléphone à JARVIS sur votre PC (4G / 5G / Extérieur)
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Pour piloter JARVIS depuis votre téléphone où que vous soyez, en toute sécurité (connexion privée et chiffrée de bout en bout), nous utilisons{" "}
          <a href="https://tailscale.com" target="_blank" rel="noreferrer" className="text-hud underline">
            Tailscale
          </a>{" "}
          🔒. Un code PIN protège l&apos;accès. JARVIS Mobile, c&apos;est simplement JARVIS ouvert dans le navigateur du téléphone, ajouté à l&apos;écran d&apos;accueil.
        </p>
        {!desktop && (
          <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100">
            Cette fonction pilote la <b>version PC (option B)</b>. Ici, dans la version en ligne, vous pouvez lire le tutoriel ; la configuration réelle se fait dans JARVIS
            installé sur votre PC.
          </p>
        )}
      </div>

      {/* Mode + PIN */}
      <div className="rounded-2xl border border-hud/35 bg-gradient-to-br from-hud/10 via-black/40 to-black/60 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="label">Accès distant</div>
          <span className="flex items-center gap-2 font-mono text-[11px]">
            <span className={`h-2 w-2 rounded-full ${connectedRecently ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : mode === "off" ? "bg-slate-500" : "bg-amber-400 shadow-[0_0_8px_#fbbf24]"}`} />
            {connectedRecently ? "Téléphone connecté" : mode === "off" ? "Désactivé" : "En attente d'un appareil"}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { id: "off", label: "Désactivé", desc: "JARVIS répond seulement à ce PC" },
            { id: "tailscale", label: "Tailscale (recommandé)", desc: "4G / 5G / extérieur, HTTPS, micro OK" },
            { id: "lan", label: "Wi‑Fi local", desc: "Même réseau, sans HTTPS : écrit seulement (pas de micro)" },
          ].map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={!desktop || busy !== null}
              onClick={() => void post({ action: "mode", mode: o.id }, "mode")}
              className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${mode === o.id ? "border-hud bg-hud/15 shadow-[0_0_12px_rgb(var(--hud-rgb)/0.25)]" : "border-hud/15 bg-black/20 hover:border-hud/40"}`}
            >
              <span className="block text-sm text-white">{o.label}</span>
              <span className="block text-[11px] leading-snug text-slate-400">{o.desc}</span>
            </button>
          ))}
        </div>
        {data?.restartNeeded && (
          <p className="mt-3 text-xs text-amber-200">Redémarrez JARVIS (bouton ⏻ puis icône du bureau) pour que l&apos;accès Wi‑Fi local soit actif. Windows peut demander une autorisation pare-feu.</p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <KeyRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-hud/60" />
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              className="hud-field !pl-9 font-mono tracking-[0.3em]"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder={data?.pinSet ? "Code PIN défini — saisir pour le changer" : "Choisir un code PIN (4 à 8 chiffres)"}
              disabled={!desktop}
            />
          </div>
          <button type="button" className="hud-btn" disabled={!desktop || busy !== null || pin.length < 4} onClick={() => void post({ action: "pin", pin }, "pin")}>
            {busy === "pin" ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Enregistrer le PIN
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {data?.pinSet ? "✅ Un code PIN protège l'accès distant." : "⚠️ Sans code PIN, aucun appareil distant ne peut se connecter."} Le code est demandé une fois par appareil, puis conservé 30 jours.
        </p>
        {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-200" : "text-red-300"}`}>{msg.ok ? "✅ " : "❌ "}{msg.text}</p>}
      </div>

      {/* Status (desktop) */}
      {desktop && (
        <div className="rounded-2xl border border-hud/20 bg-black/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="label">État sur ce PC</div>
            <button type="button" className="hud-btn !h-8" onClick={() => void load()}>
              <RefreshCw size={13} /> Actualiser
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <ul className="space-y-2">
              <Check ok={data ? Boolean(ts?.installed) : null} label="Tailscale installé" hint={ts?.installed ? undefined : "Étape 1"} />
              <Check ok={data ? Boolean(ts?.running) : null} label="Tailscale connecté" hint={ts && ts.installed && !ts.running ? `État : ${ts.backendState || "arrêté"} — ouvrez Tailscale et connectez-vous` : undefined} />
              <Check ok={data ? Boolean(ts?.httpsEnabled) : null} label="HTTPS activé dans la console Tailscale" hint={ts && !ts.httpsEnabled ? "Étape 2 (obligatoire pour le micro)" : undefined} />
              <Check ok={data ? Boolean(ts?.serving) : null} label="JARVIS publié par Tailscale (tailscale serve)" hint={ts && ts.running && !ts.serving ? "Cliquez sur « Publier JARVIS »" : undefined} />
              <Check ok={data ? Boolean(data.pinSet) : null} label="Code PIN défini" />
            </ul>
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-hud/15 bg-black/40 p-3">
              {data?.qrSvg && mode !== "off" ? (
                <>
                  <div className="h-32 w-32 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: data.qrSvg }} />
                  <span className="text-center text-[10px] text-slate-400">Scannez avec le téléphone</span>
                </>
              ) : (
                <span className="text-center text-xs text-slate-500">QR code disponible une fois l&apos;accès configuré</span>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="hud-btn" disabled={busy !== null || !ts?.running} onClick={() => void post({ action: "serve", on: true }, "serve")}>
              {busy === "serve" ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />} Publier JARVIS via Tailscale
            </button>
            {ts?.serving && (
              <button type="button" className="hud-btn" disabled={busy !== null} onClick={() => void post({ action: "serve", on: false }, "serve")}>
                Arrêter la publication
              </button>
            )}
          </div>
          {ts?.error && <p className="mt-2 text-xs text-amber-200">{ts.error}</p>}
        </div>
      )}

      {/* The 4 steps */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Step n={1} title="Installer Tailscale (gratuit)" pill="Gratuit" tone="free" done={Boolean(ts?.installed && ts?.running)}>
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <b className="text-white">Sur votre PC :</b> téléchargez et installez Tailscale
              <br />
              <Link href="https://tailscale.com/download/windows">https://tailscale.com/download/windows</Link>
            </li>
            <li>
              <b className="text-white">Sur votre téléphone :</b> installez l&apos;application <b className="text-white">Tailscale</b> depuis le Play Store ou l&apos;App Store.
            </li>
            <li>
              <b className="text-white">Connectez-vous</b> avec le <b className="text-white">MÊME compte</b> sur les deux appareils (ex. votre compte Google).
            </li>
          </ol>
        </Step>

        <Step n={2} title="Activer le HTTPS" pill="Obligatoire" tone="required" done={Boolean(ts?.httpsEnabled)}>
          <p className="text-xs italic text-slate-400">Obligatoire pour autoriser le microphone et garantir la sécurité.</p>
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              Ouvrez votre console admin Tailscale
              <br />
              <Link href="https://login.tailscale.com/admin/dns">https://login.tailscale.com/admin/dns</Link>
            </li>
            <li>
              Rendez-vous dans l&apos;onglet <b className="text-white">DNS</b>. Vérifiez que <b className="text-white">MagicDNS</b> est activé.
            </li>
            <li>
              Descendez jusqu&apos;à la section <b className="text-white">HTTPS Certificates</b>.
            </li>
            <li>
              Cliquez sur <b className="text-white">Enable HTTPS</b> (Activer).
            </li>
          </ol>
        </Step>

        <Step n={3} title="Récupérer l'adresse HTTPS de votre PC" pill="Adresse machine" tone="info" done={Boolean(ts?.dnsName)}>
          {ts?.dnsName ? (
            <p className="text-xs text-emerald-200">Détecté automatiquement sur ce PC :</p>
          ) : (
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                Dans votre console Tailscale, allez sur l&apos;onglet <b className="text-white">Machines</b>
                <br />
                <Link href="https://login.tailscale.com/admin/machines">https://login.tailscale.com/admin/machines</Link>
              </li>
              <li>
                Cliquez sur votre <b className="text-white">PC</b>.
              </li>
              <li>
                Copiez le <b className="text-white">nom de domaine complet (Full name)</b> de votre machine.
              </li>
            </ol>
          )}
          <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs">
            <span className="text-slate-500">{ts?.dnsName ? "Votre PC : " : "Exemple : "}</span>
            <span className="text-hud">{ts?.dnsName ?? "mon-pc.tail12345.ts.net"}</span>
          </div>
          {desktop && (
            <p className="text-xs text-slate-400">
              Puis cliquez sur <b className="text-slate-200">« Publier JARVIS via Tailscale »</b> ci-dessus : JARVIS lance <span className="font-mono">tailscale serve</span> pour vous.
            </p>
          )}
        </Step>

        <Step n={4} title="Configurer JARVIS sur le téléphone" pill="Connexion" tone="ok" done={connectedRecently}>
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              Lancez <b className="text-white">JARVIS sur votre PC</b> (il doit rester allumé).
            </li>
            <li>
              Sur le téléphone, ouvrez <b className="text-white">Chrome</b> (Android) ou <b className="text-white">Safari</b> (iPhone), Tailscale étant connecté.
            </li>
            <li>
              Entrez votre adresse avec <span className="font-mono">https://</span> devant, ou scannez le QR code :
            </li>
          </ol>
          <Code>{address ?? "https://NOM-DE-VOTRE-PC.tailXXXXX.ts.net"}</Code>
          <ol className="list-decimal space-y-2 pl-4" start={4}>
            <li>
              Saisissez le <b className="text-white">code PIN</b>, puis menu ⋮ → <b className="text-white">« Ajouter à l&apos;écran d&apos;accueil »</b> : JARVIS Mobile est installé.
            </li>
          </ol>
          <div className={`rounded-xl border px-3 py-2 text-xs ${connectedRecently ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100" : "border-hud/20 bg-hud/5 text-slate-300"}`}>
            <span className={`mr-2 inline-block h-2 w-2 rounded-full ${connectedRecently ? "bg-emerald-400" : "bg-slate-500"}`} />
            5. Validez : le voyant passe au <b>Vert (Connecté)</b> dès que le téléphone est relié !
          </div>
        </Step>
      </div>

      <div className="rounded-2xl border border-hud/15 bg-black/20 p-4 text-xs leading-relaxed text-slate-400">
        <b className="text-slate-200">Sécurité :</b> seuls les appareils de votre compte Tailscale atteignent votre PC, et le code PIN est demandé en plus. Les commandes du
        téléphone ont les mêmes droits que sur le PC (applications, maison connectée). Le mode Wi‑Fi local est en HTTP : les navigateurs y refusent le micro, mais vous pouvez
        écrire vos demandes.
      </div>
    </div>
  );
}
