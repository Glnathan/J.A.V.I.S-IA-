"use client";

import { Camera, Eye, Loader2, ScanFace, Video, VideoOff, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { enrollFace, recognizeFrame, removeFace, type FaceState, type StoredFace } from "@/lib/client/vision-face";

interface Props {
  onClose: () => void;
  /** Expose la trame courante de la caméra (pour « décris ce que voit la caméra »). */
  frameRef: MutableRefObject<(() => string | null) | null>;
  /** Salutation vocale quand un visage inscrit est reconnu. */
  onGreet: (name: string) => void;
  /** Analyse IA d'une image (envoyée au chat, fournie par JarvisApp). */
  onDescribe: (image: string) => void;
  premium: boolean;
  /** Visages inscrits (reconnaissance, famille) et prénom (inscription). */
  faceData: StoredFace[] | null;
  userName: string;
}

const DET_W = 64;
const DET_H = 48;
const CELL = 8; // taille d'une cellule de la grille de détection
const THRESHOLD = 28; // sensibilité : écart de luminance (0-255)

interface MotionBox {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

/** Détection de mouvement par différence d'images, sur une grille de cellules. */
function detectMotion(prev: Uint8ClampedArray | null, cur: Uint8ClampedArray): MotionBox | null {
  if (!prev || prev.length !== cur.length) return null;
  const cols = DET_W / CELL;
  const rows = DET_H / CELL;
  const grid = new Float32Array(cols * rows);
  let total = 0;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let sum = 0;
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const px = ((cy * CELL + y) * DET_W + cx * CELL + x) * 4;
          const diff =
            Math.abs(cur[px] - prev[px]) + Math.abs(cur[px + 1] - prev[px + 1]) + Math.abs(cur[px + 2] - prev[px + 2]);
          sum += diff / 3;
        }
      }
      const v = sum / (CELL * CELL);
      grid[cy * cols + cx] = v;
      total += v;
    }
  }
  if (total / (cols * rows) < 1.2) return null;

  // Plus grand bloc contigu de cellules en mouvement (croissance par voisinage).
  let best: { cells: [number, number][]; score: number } | null = null;
  const seen = new Uint8Array(cols * rows);
  for (let i = 0; i < grid.length; i++) {
    if (seen[i] || grid[i] < THRESHOLD) continue;
    const stack = [i];
    seen[i] = 1;
    const cells: [number, number][] = [];
    let score = 0;
    while (stack.length) {
      const j = stack.pop()!;
      const cx = j % cols;
      const cy = (j / cols) | 0;
      cells.push([cx, cy]);
      score += grid[j];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const k = ny * cols + nx;
        if (!seen[k] && grid[k] >= THRESHOLD * 0.7) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    if (!best || score > best.score) best = { cells, score };
  }
  if (!best) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [cx, cy] of best.cells) {
    minX = Math.min(minX, cx);
    minY = Math.min(minY, cy);
    maxX = Math.max(maxX, cx + 1);
    maxY = Math.max(maxY, cy + 1);
  }
  return { x: minX / cols, y: minY / rows, w: (maxX - minX) / cols, h: (maxY - minY) / rows, score: best.score };
}

function cornerRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, len: number) {
  ctx.beginPath();
  // coin haut-gauche
  ctx.moveTo(x, y + len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  // haut-droite
  ctx.moveTo(x + w - len, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + len);
  // bas-droite
  ctx.moveTo(x + w, y + h - len);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - len, y + h);
  // bas-gauche
  ctx.moveTo(x + len, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - len);
  ctx.stroke();
}

export default function VisionPanel({ onClose, frameRef, onGreet, onDescribe, premium, faceData, userName }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detRef = useRef<HTMLCanvasElement | null>(null);
  const prevRef = useRef<Uint8ClampedArray | null>(null);
  const rafRef = useRef(0);
  const lastAnnounceRef = useRef(0);
  const faceBusyRef = useRef(0);
  const [status, setStatus] = useState<"starting" | "live" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const [faceOn, setFaceOn] = useState(false);
  const [face, setFace] = useState<FaceState>({ status: "idle" });
  const [enrolling, setEnrolling] = useState(false);
  const [newName, setNewName] = useState(userName);
  const [faceMsg, setFaceMsg] = useState<string | null>(null);
  const motionLabelRef = useRef<HTMLSpanElement | null>(null);

  // Callbacks dans des refs : la boucle d'animation ne doit jamais redemarrer à cause d'un re-rendu.
  const announce = useCallback(
    (side: string) => {
      const now = Date.now();
      if (now - lastAnnounceRef.current < 15000) return;
      lastAnnounceRef.current = now;
      onGreet(`Mouvement détecté ${side}.`);
    },
    [onGreet],
  );
  const announceRef = useRef(announce);
  const greetRef = useRef(onGreet);
  useEffect(() => {
    announceRef.current = announce;
    greetRef.current = onGreet;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let alive = true;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } } });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        setStatus("live");
      } catch (e) {
        if (!alive) return;
        setStatus("error");
        setError(e instanceof Error && e.name === "NotAllowedError" ? "Accès à la caméra refusé — autorisez-la dans votre navigateur." : "Caméra indisponible.");
      }
    })();
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Boucle de rendu : flux vidéo + surimpositions HUD + détection de mouvement.
  useEffect(() => {
    if (status !== "live") return;
    const det = document.createElement("canvas");
    det.width = DET_W;
    det.height = DET_H;
    detRef.current = det;
    const dctx = det.getContext("2d", { willReadFrequently: true });

    let framesStill = 0;
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c || !dctx || v.readyState < 2) return;
      if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
        c.width = v.videoWidth || 640;
        c.height = v.videoHeight || 480;
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;

      ctx.save();
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1); // effet miroir, naturel pour se voir
      ctx.drawImage(v, 0, 0, c.width, c.height);
      ctx.restore();

      // Teinte HUD
      ctx.fillStyle = "rgba(34, 211, 238, 0.06)";
      ctx.fillRect(0, 0, c.width, c.height);

      // Détection de mouvement (grille réduite)
      dctx.drawImage(v, 0, 0, DET_W, DET_H);
      const data = dctx.getImageData(0, 0, DET_W, DET_H).data;
      const box = detectMotion(prevRef.current, data);
      prevRef.current = data;

      if (box && box.score > 60) {
        framesStill = 75; // ~1,25 s sans mouvement avant de réafficher « AUCUN MOUVEMENT »
        const bx = box.x * c.width;
        const by = box.y * c.height;
        const bw = box.w * c.width;
        const bh = box.h * c.height;
        ctx.strokeStyle = "rgba(34, 211, 238, 0.9)";
        ctx.lineWidth = 2;
        cornerRect(ctx, bx, by, bw, bh, Math.min(22, bw / 3));
        ctx.fillStyle = "rgba(34, 211, 238, 0.08)";
        ctx.fillRect(bx, by, bw, bh);
        ctx.font = "600 11px monospace";
        ctx.fillStyle = "rgba(34, 211, 238, 0.95)";
        ctx.fillText(`CIBLE · ${Math.round(box.w * 100)}%×${Math.round(box.h * 100)}%`, bx + 2, Math.max(11, by - 4));
        const cx = bx + bw / 2;
        const pct = Math.min(100, Math.round(box.score / 8));
        const side = cx < c.width / 3 ? "à gauche" : cx > (c.width * 2) / 3 ? "à droite" : "au centre";
        if (motionLabelRef.current) motionLabelRef.current.textContent = `MOUVEMENT ${side.toUpperCase()} · ${pct}%`;
        if (pct > 30) announceRef.current(side);
      } else if (motionLabelRef.current && framesStill > 0 && --framesStill === 0) {
        motionLabelRef.current.textContent = "AUCUN MOUVEMENT";
      }

      // Croix centrale + réticule
      const midX = c.width / 2;
      const midY = c.height / 2;
      ctx.strokeStyle = "rgba(34, 211, 238, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(midX - 26, midY);
      ctx.lineTo(midX - 8, midY);
      ctx.moveTo(midX + 8, midY);
      ctx.lineTo(midX + 26, midY);
      ctx.moveTo(midX, midY - 26);
      ctx.lineTo(midX, midY - 8);
      ctx.moveTo(midX, midY + 8);
      ctx.lineTo(midX, midY + 26);
      ctx.stroke();
      ctx.strokeRect(midX - 60, midY - 60, 120, 120);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status]);

  // Exposition de la trame courante pour « décris ce que voit la caméra ».
  useEffect(() => {
    frameRef.current = () => canvasRef.current?.toDataURL("image/jpeg", 0.8) ?? null;
    return () => {
      frameRef.current = null;
    };
  }, [frameRef]);

  // Reconnaissance faciale périodique (si activée).
  useEffect(() => {
    if (!faceOn || status !== "live") return;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      const now = Date.now();
      if (now - faceBusyRef.current > 2000 && canvasRef.current) {
        faceBusyRef.current = now;
        const r = await recognizeFrame(canvasRef.current, faceData);
        if (!alive) return;
        setFace(r);
        if (r.status === "recognized" && r.greet) greetRef.current(`Bonjour, ${r.name}.`);
      }
      setTimeout(() => void tick(), 400);
    };
    void tick();
    return () => {
      alive = false;
    };
  }, [faceOn, status, faceData]);

  const enroll = async () => {
    if (!canvasRef.current) return;
    setEnrolling(true);
    setFace({ status: "loading" });
    const r = await enrollFace(canvasRef.current, newName, faceData ?? []);
    setFace(r);
    setFaceMsg(
      r.status === "error"
        ? (r.message ?? "Échec de l'inscription.")
        : r.status === "no-face"
          ? "Aucun visage détecté — placez-vous dans le cadre, avec assez de lumière."
          : r.status === "recognized"
            ? `Visage « ${r.name} » inscrit.`
            : null,
    );
    setEnrolling(false);
  };

  const remove = async (name: string) => {
    const r = await removeFace(name, faceData ?? []);
    setFaceMsg(r.status === "error" ? (r.message ?? "Échec de la suppression.") : `Visage « ${name} » retiré.`);
  };

  const sideLabel = "AUCUN MOUVEMENT";
  const faceLabel =
    face.status === "loading"
      ? "MODÈLE…"
      : face.status === "not-enrolled"
        ? "AUCUN VISAGE INSCRIT"
        : face.status === "no-face"
          ? "AUCUN VISAGE"
          : face.status === "recognized"
            ? `IDENTIFIÉ : ${face.name.toUpperCase()}`
            : face.status === "unknown"
              ? "VISAGE INCONNU"
              : face.status === "error"
                ? "MODÈLE INDISPONIBLE"
                : "VISAGE : VEILLE";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="hud-panel fade-in relative z-10 flex h-[92dvh] w-[min(96vw,1100px)] flex-col !bg-[#030b14]/95 p-4">
        <header className="mb-3 flex flex-wrap items-center gap-3">
          <span className="glow-text font-display text-sm tracking-[0.3em] text-hud">VISION</span>
          <span ref={motionLabelRef} className="font-mono text-[10px] uppercase tracking-[0.2em] text-hud/60">{sideLabel}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-hud/60">{faceLabel}</span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              className="hud-btn"
              title={faceOn ? "Couper la reconnaissance faciale" : "Activer la reconnaissance faciale"}
              data-active={faceOn}
              onClick={() => setFaceOn(!faceOn)}
            >
              <ScanFace size={13} /> Visage
            </button>
            <button
              type="button"
              className="hud-btn"
              title="Demander à l'IA ce qu'elle voit dans la caméra"
              onClick={() => canvasRef.current && onDescribe(canvasRef.current.toDataURL("image/jpeg", 0.8))}
            >
              <Eye size={13} /> Décrire
            </button>
            <button type="button" className="hud-btn" onClick={onClose} title="Fermer (ou dites « coupe la vision »)">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded border border-hud/25 bg-black/60">
          <video ref={videoRef} className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0" playsInline muted />
          <canvas ref={canvasRef} className="h-full w-full object-contain" />
          <div className="scanlines pointer-events-none absolute inset-0" />
          <div className="vignette pointer-events-none absolute inset-0" />
          {/* Coins du cadre */}
          <span className="pointer-events-none absolute left-2 top-2 h-5 w-5 border-l-2 border-t-2 border-hud/70" />
          <span className="pointer-events-none absolute right-2 top-2 h-5 w-5 border-r-2 border-t-2 border-hud/70" />
          <span className="pointer-events-none absolute bottom-2 left-2 h-5 w-5 border-b-2 border-l-2 border-hud/70" />
          <span className="pointer-events-none absolute bottom-2 right-2 h-5 w-5 border-b-2 border-r-2 border-hud/70" />
          {/* Télémétrie */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.25em] text-hud/80">
            CAM-01 · ANALYSE EN CONTINU · {status === "live" ? "EN LIGNE" : status === "error" ? "HORS LIGNE" : "DÉMARRAGE"}
          </div>
          {status === "starting" && (
            <div className="absolute inset-0 grid place-items-center">
              <p className="flex items-center gap-2 text-sm text-hud">
                <Loader2 size={16} className="animate-spin" /> Mise en route de la caméra…
              </p>
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <div>
                <VideoOff size={28} className="mx-auto text-red-400" />
                <p className="mt-3 text-sm text-red-200">{error ?? "Caméra indisponible."}</p>
              </div>
            </div>
          )}
        </div>

        {premium && (
          <footer className="mt-3 space-y-2 text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <Camera size={13} className="text-hud" />
              <span>Dites « Jarvis, décris ce que tu vois » (caméra) ou « décris mon écran » (écran).</span>
              <span className="font-mono text-[10px] text-hud/60">{faceLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded border border-hud/15 bg-black/20 p-2">
              <ScanFace size={13} className="text-hud" />
              <input
                className="hud-field !h-7 w-36 text-xs"
                value={newName}
                placeholder="Prénom (ex. Nathan)"
                onChange={(e) => setNewName(e.target.value)}
              />
              <button type="button" className="hud-btn !h-7" onClick={() => void enroll()} disabled={enrolling}>
                {enrolling ? <Loader2 size={11} className="animate-spin" /> : <Video size={11} />} Inscrire ce visage
              </button>
              {faceData && faceData.length > 0 && (
                <span className="flex flex-wrap items-center gap-1">
                  {faceData.map((f) => (
                    <span key={f.name} className="flex items-center gap-1 rounded border border-hud/20 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                      {f.name}
                      <button type="button" className="text-red-300 hover:text-red-200" title={`Retirer ${f.name}`} onClick={() => void remove(f.name)}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </span>
              )}
            </div>
            <p className="text-[10px] leading-snug text-slate-500">
              Inscrivez jusqu&apos;à 6 visages — la famille commande JARVIS aussi, et il salue chacun par son prénom.
              {faceMsg && <span className="ml-1 text-slate-400">{faceMsg}</span>}
            </p>
          </footer>
        )}
      </div>
    </div>
  );
}
