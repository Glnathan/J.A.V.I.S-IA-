"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Mic, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  browserInfo,
  captureErrorMessage,
  getRecognitionCtor,
  inIframe,
  micAllowedByPolicy,
  recognitionErrorMessage,
  type SpeechRec,
} from "@/lib/client/recognition";
import { transcribe, VoiceCapture } from "@/lib/client/voice-capture";

type CheckState = "running" | "ok" | "warn" | "error";
interface Check {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
}
interface TestResult {
  ok: boolean;
  text?: string;
  error?: string;
}

interface Props {
  sttAvailable: boolean;
  compact?: boolean;
  autoStart?: boolean;
  onUseWhisper?: () => void;
  onResult?: (ok: boolean) => void;
}

function icon(state: CheckState): ReactNode {
  if (state === "running") return <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-hud" />;
  if (state === "ok") return <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />;
  if (state === "warn") return <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />;
  return <XCircle size={15} className="mt-0.5 shrink-0 text-red-400" />;
}

function measureLevel(stream: MediaStream, ms: number, onLevel: (l: number) => void, register: (stop: () => void) => void): Promise<number> {
  return new Promise((resolve) => {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) {
      resolve(0.05);
      return;
    }
    const ctx = new C();
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(an);
    const data = new Float32Array(an.fftSize);
    let peak = 0;
    let raf = 0;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      onLevel(0);
      void ctx.close().catch(() => undefined);
      resolve(peak);
    };
    const loop = () => {
      an.getFloatTimeDomainData(data);
      let s = 0;
      for (let i = 0; i < data.length; i++) s += data[i] * data[i];
      const rms = Math.sqrt(s / data.length);
      peak = Math.max(peak, rms);
      onLevel(Math.min(1, rms * 7));
      raf = requestAnimationFrame(loop);
    };
    if (ctx.state === "suspended") void ctx.resume();
    loop();
    timer = setTimeout(end, ms);
    register(end);
  });
}

function testRecognition(Ctor: new () => SpeechRec, onText: (t: string) => void, register: (stop: () => void) => void): Promise<TestResult> {
  return new Promise((resolve) => {
    const r = new Ctor();
    r.lang = "fr-FR";
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    let finalText = "";
    let lastInterim = "";
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (res: TestResult) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      try {
        r.abort();
      } catch {
        /* ignore */
      }
      resolve(res);
    };
    const heard = (): TestResult => {
      const t = (finalText || lastInterim).trim();
      return t ? { ok: true, text: t } : { ok: false, error: "no-speech" };
    };
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0]?.transcript ?? "";
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      lastInterim = interim || lastInterim;
      onText(finalText || interim);
      if (finalText.trim()) finish({ ok: true, text: finalText.trim() });
    };
    r.onerror = (e) => finish(e.error === "no-speech" ? heard() : { ok: false, error: e.error });
    r.onend = () => finish(heard());
    timer = setTimeout(() => finish(heard()), 9000);
    register(() => finish({ ok: false, error: "aborted" }));
    try {
      r.start();
    } catch {
      finish({ ok: false, error: "start-failed" });
    }
  });
}

function testWhisper(onLevel: (l: number) => void, register: (stop: () => void) => void): Promise<TestResult> {
  return new Promise((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = (res: TestResult) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      cap.stop();
      resolve(res);
    };
    const cap = new VoiceCapture({
      silenceMs: 1000,
      maxMs: 8000,
      minSpeechMs: 200,
      onLevel,
      onSegment: (wav) => {
        if (timer) clearTimeout(timer);
        transcribe(wav)
          .then((r) => end(r.text ? { ok: true, text: r.text } : { ok: false, error: "Rien de compréhensible n'a été entendu." }))
          .catch((e: unknown) => end({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      },
    });
    register(() => end({ ok: false, error: "Test interrompu." }));
    cap
      .start("single")
      .then(() => {
        timer = setTimeout(() => {
          if (!cap.flush()) end({ ok: false, error: "Je n'ai rien entendu." });
        }, 8000);
      })
      .catch((e: unknown) => end({ ok: false, error: captureErrorMessage(e, inIframe()) }));
  });
}

export default function MicDiagnostic({ sttAvailable, compact = false, autoStart = false, onUseWhisper, onResult }: Props) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState(0);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [heard, setHeard] = useState("");
  const [devices, setDevices] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<{ ok: boolean; text: string } | null>(null);
  const [outcome, setOutcome] = useState<{ sr: boolean; whisper: boolean } | null>(null);
  const [iframe, setIframe] = useState(false);
  const stopRef = useRef<() => void>(() => undefined);
  const aliveRef = useRef(true);

  const put = (c: Check) =>
    setChecks((cs) => {
      const i = cs.findIndex((x) => x.id === c.id);
      if (i < 0) return [...cs, c];
      const next = [...cs];
      next[i] = c;
      return next;
    });

  const finish = (sr: boolean, whisper: boolean, text: string) => {
    setRunning(false);
    setPrompt(null);
    setLevel(0);
    setVerdict({ ok: sr || whisper, text });
    setOutcome({ sr, whisper });
    onResult?.(sr || whisper);
  };

  const run = async () => {
    stopRef.current();
    setRunning(true);
    setChecks([]);
    setHeard("");
    setDevices([]);
    setVerdict(null);
    setOutcome(null);
    setPrompt(null);
    const b = browserInfo();
    const Ctor = getRecognitionCtor();
    const frame = inIframe();
    const policy = micAllowedByPolicy();
    const srUsable = Boolean(Ctor) && !b.brave;

    put({
      id: "browser",
      label: "Navigateur",
      state: srUsable ? "ok" : sttAvailable ? "warn" : "error",
      detail: srUsable
        ? `${b.name} : reconnaissance vocale disponible.`
        : `${b.name} : pas de reconnaissance vocale intégrée${sttAvailable ? ", le moteur Whisper prendra le relais." : ". Utilisez Chrome ou Edge, ou configurez le moteur Whisper."}`,
    });
    if (!window.isSecureContext) put({ id: "secure", label: "Sécurité", state: "error", detail: "Le micro exige une adresse https:// ou http://localhost." });
    if (frame) {
      put({
        id: "frame",
        label: "Fenêtre",
        state: policy === false ? "error" : "warn",
        detail:
          policy === false
            ? "Aperçu intégré : le navigateur y bloque le micro. Ouvrez JARVIS dans un nouvel onglet."
            : "JARVIS est affiché dans un cadre : en cas de problème, ouvrez-le dans un nouvel onglet.",
      });
    }
    try {
      const st = await navigator.permissions?.query({ name: "microphone" as PermissionName });
      if (st) {
        put({
          id: "perm",
          label: "Autorisation",
          state: st.state === "granted" ? "ok" : st.state === "denied" ? "error" : "warn",
          detail:
            st.state === "granted"
              ? "Micro autorisé pour JARVIS."
              : st.state === "denied"
                ? "Micro refusé pour JARVIS : réautorisez-le (icône à gauche de l'adresse, ou menu ⋯ → Autorisations du site)."
                : "Le navigateur va demander l'autorisation : cliquez sur « Autoriser ».",
        });
      }
    } catch {
      /* permission query not supported (Firefox) */
    }

    put({ id: "capture", label: "Capture du son", state: "running", detail: "Parlez normalement pendant 4 secondes…" });
    setPrompt("Parlez normalement : « un, deux, trois… »");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      put({ id: "capture", label: "Capture du son", state: "error", detail: captureErrorMessage(e, frame) });
      finish(false, false, "Le micro n'est pas accessible : suivez les conseils ci-dessus, puis relancez le test.");
      return;
    }
    put({ id: "perm", label: "Autorisation", state: "ok", detail: "Micro autorisé pour JARVIS." });
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "audioinput").map((d) => `${d.deviceId === "default" ? "★ " : ""}${d.label || "Micro sans nom"}`));
    } catch {
      /* ignore */
    }
    const micName = stream.getAudioTracks()[0]?.label || "micro par défaut";
    const peak = await measureLevel(stream, 4000, (l) => aliveRef.current && setLevel(l), (s) => (stopRef.current = s));
    stream.getTracks().forEach((t) => t.stop());
    if (!aliveRef.current) return;
    const captureOk = peak >= 0.012;
    put({
      id: "capture",
      label: "Capture du son",
      state: peak >= 0.04 ? "ok" : captureOk ? "warn" : "error",
      detail:
        peak >= 0.04
          ? `« ${micName} » capte bien votre voix.`
          : captureOk
            ? `Son faible sur « ${micName} » : rapprochez-vous ou montez le volume d'entrée (Paramètres Windows → Son → Entrée).`
            : `Aucun son capté par « ${micName} ». Micro coupé (touche muet) ou mauvais micro ? Choisissez le bon dans Paramètres Windows → Son → Entrée.`,
    });

    let srOk = false;
    if (srUsable && Ctor) {
      put({ id: "speech", label: "Reconnaissance vocale", state: "running", detail: "Dites : « Bonjour Jarvis »" });
      setPrompt("Dites maintenant : « Bonjour Jarvis »");
      setHeard("");
      const res = await testRecognition(Ctor, (t) => aliveRef.current && setHeard(t), (s) => (stopRef.current = s));
      if (!aliveRef.current) return;
      srOk = res.ok;
      put({
        id: "speech",
        label: "Reconnaissance vocale",
        state: res.ok ? "ok" : "error",
        detail: res.ok ? `Compris : « ${res.text} »` : recognitionErrorMessage(res.error ?? "unknown", { iframe: frame, brave: b.brave, edge: b.edge, whisper: sttAvailable }),
      });
    }

    let whisperOk = false;
    if (sttAvailable && !srOk) {
      put({ id: "whisper", label: "Moteur Whisper", state: "running", detail: "Dites : « Bonjour Jarvis »" });
      setPrompt("Moteur Whisper : dites « Bonjour Jarvis »");
      setHeard("");
      const res = await testWhisper((l) => aliveRef.current && setLevel(l), (s) => (stopRef.current = s));
      if (!aliveRef.current) return;
      whisperOk = res.ok;
      if (res.ok) setHeard(res.text ?? "");
      put({ id: "whisper", label: "Moteur Whisper", state: res.ok ? "ok" : "error", detail: res.ok ? `Compris : « ${res.text} »` : (res.error ?? "Échec.") });
    }

    finish(
      srOk,
      whisperOk,
      srOk
        ? "JARVIS vous entend parfaitement."
        : whisperOk
          ? "Le moteur Whisper fonctionne : activez-le pour que JARVIS vous entende."
          : captureOk
            ? "Le micro capte le son, mais la reconnaissance vocale échoue : suivez les conseils ci-dessus."
            : "JARVIS ne vous entend pas encore : suivez les conseils ci-dessus, puis relancez le test.",
    );
  };

  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    aliveRef.current = true;
    setIframe(inIframe());
    if (autoStart) void runRef.current();
    return () => {
      aliveRef.current = false;
      stopRef.current();
    };
  }, [autoStart]);

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!running && !checks.length && (
        <p className="text-sm leading-relaxed text-slate-300">
          Ce test vérifie votre micro, les autorisations et la reconnaissance vocale en moins de 20 secondes.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={checks.length ? "hud-btn" : "hud-btn-primary !px-5 !py-2.5 !text-[11px]"} onClick={() => void run()} disabled={running}>
          <span className="inline-flex items-center gap-2">
            {running ? <Loader2 size={14} className="animate-spin" /> : checks.length ? <RefreshCw size={14} /> : <Mic size={14} />}
            {running ? "Test en cours…" : checks.length ? "Relancer le test" : "Tester le micro"}
          </span>
        </button>
        {iframe && (
          <button type="button" className="hud-btn" onClick={() => window.open(window.location.href, "_blank", "noopener")}>
            <ExternalLink size={14} /> Ouvrir dans un nouvel onglet
          </button>
        )}
      </div>

      {prompt && (
        <div className="rounded border border-hud/40 bg-hud/10 p-3">
          <div className="text-sm text-white">{prompt}</div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-hud/10">
            <div className="h-full bg-hud shadow-[0_0_10px_var(--hud)] transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          {heard && <div className="mt-2 text-sm italic text-hud">« {heard} »</div>}
        </div>
      )}

      {checks.length > 0 && (
        <ul className="space-y-1.5">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              {icon(c.state)}
              <span>
                <span className="text-slate-100">{c.label} : </span>
                <span className="text-slate-300">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {verdict && (
        <div className={`rounded border p-3 text-sm ${verdict.ok ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-100" : "border-red-400/30 bg-red-400/5 text-red-100"}`}>
          {verdict.ok ? "✅ " : "❌ "}
          {verdict.text}
        </div>
      )}
      {outcome && !outcome.sr && outcome.whisper && onUseWhisper && (
        <button type="button" className="hud-btn" data-active="true" onClick={onUseWhisper}>
          Utiliser le moteur Whisper
        </button>
      )}
      {outcome && !outcome.sr && !outcome.whisper && !sttAvailable && (
        <p className="text-xs leading-relaxed text-slate-400">
          Astuce : le moteur Whisper (clé Groq gratuite sur console.groq.com, à saisir dans Paramètres → Voix & micro) fonctionne dans tous les navigateurs.
        </p>
      )}
      {devices.length > 0 && !compact && (
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer">Micros détectés ({devices.length})</summary>
          <ul className="mt-1 space-y-0.5 pl-4">
            {devices.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
          <p className="mt-1">★ = micro par défaut, utilisé par la reconnaissance vocale. Changez-le dans Paramètres Windows → Son → Entrée.</p>
        </details>
      )}
    </div>
  );
}
