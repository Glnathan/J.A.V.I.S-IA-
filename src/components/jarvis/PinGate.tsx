"use client";

import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

export default function PinGate({ noPin }: { noPin: boolean }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || pin.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/remote/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) {
        setError(j.error ?? "Connexion impossible.");
        setPin("");
        input.current?.focus();
        return;
      }
      setOk(true);
      setTimeout(() => window.location.replace("/"), 500);
    } catch {
      setError("Le PC ne répond pas. JARVIS est-il lancé ?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="hud-bg relative grid min-h-dvh place-items-center overflow-hidden px-6 py-10">
      <div className="hud-grid pointer-events-none absolute inset-0" />
      <div className="scanlines pointer-events-none absolute inset-0" />
      <div className="vignette pointer-events-none absolute inset-0" />
      <div className="hud-panel fade-in relative w-full max-w-sm p-7 text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full border border-hud/50 bg-hud/10 shadow-[0_0_28px_var(--hud)]">
          {ok ? <ShieldCheck size={28} className="text-hud" /> : <Lock size={26} className="text-hud" />}
        </div>
        <h1 className="glow-text font-display text-2xl tracking-[0.3em] text-hud">J.A.R.V.I.S.</h1>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.3em] text-hud/60">Accès distant sécurisé</p>

        {noPin ? (
          <p className="mt-6 text-sm leading-relaxed text-amber-100">
            Aucun code PIN n&apos;est défini. Sur votre PC, ouvrez J.A.R.V.I.S. → Paramètres → Mobile et choisissez un code.
          </p>
        ) : ok ? (
          <p className="mt-6 text-sm text-emerald-200">Identité confirmée. Connexion…</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <p className="text-sm text-slate-300">Entrez le code PIN défini sur votre PC.</p>
            <input
              ref={input}
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="hud-field !py-3 text-center font-mono !text-2xl tracking-[0.6em]"
              aria-label="Code PIN"
            />
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button type="submit" className="hud-btn-primary w-full !py-3" disabled={busy || pin.length < 4}>
              <span className="inline-flex items-center gap-2">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} Déverrouiller
              </span>
            </button>
          </form>
        )}
        <p className="mt-6 text-[11px] leading-relaxed text-slate-500">
          Connexion privée via Tailscale ou votre Wi‑Fi. Le code est conservé 30 jours sur cet appareil.
        </p>
      </div>
    </main>
  );
}
