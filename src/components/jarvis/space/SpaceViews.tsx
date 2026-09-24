"use client";

// Vues Espace partagées : panneau intégré de JARVIS (SpacePanel) et page /espace.
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { moonPosition, solarSystem } from "@/lib/solar";

/* ─── Utilitaires canvas ─────────────────────────────────────────────── */

function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[] = []) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const render = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRef.current(ctx, w, h);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

function hudColor(): [number, number, number] {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--hud-rgb").trim();
  const m = v.match(/(\d+)\s+(\d+)\s+(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [34, 211, 238];
}

/* ─── Vue : système solaire en temps réel ────────────────────────────── */

export const SPACE_SPEEDS: { label: string; factor: number }[] = [
  { label: "Temps réel", factor: 1 },
  { label: "1 h/s", factor: 3600 },
  { label: "1 jour/s", factor: 86400 },
];

export function SolarView() {
  const zoom = useRef(1);
  const pan = useRef({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const offset = useRef(0);
  const [speedIdx, setSpeedIdx] = useState(0);

  const compress = (au: number) => Math.pow(au, 0.42);

  const ref = useCanvas((ctx, w, h) => {
    const [r, g, b] = hudColor();
    const now = Date.now() + offset.current;
    const cx = w / 2 + pan.current.x;
    const cy = h / 2 + pan.current.y;
    const base = Math.min(w, h) * 0.42 * zoom.current;
    ctx.clearRect(0, 0, w, h);
    let earthPos: { px: number; py: number } | null = null;

    // Soleil
    const sunGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 46);
    sunGlow.addColorStop(0, "rgba(255,214,120,0.95)");
    sunGlow.addColorStop(0.4, "rgba(255,170,60,0.35)");
    sunGlow.addColorStop(1, "rgba(255,170,60,0)");
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd97a";
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fill();

    // Orbites + planètes
    for (const p of solarSystem(now)) {
      const or = compress(p.a) * base;
      ctx.strokeStyle = `rgba(${r},${g},${b},0.14)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, or, 0, Math.PI * 2);
      ctx.stroke();

      const dist = Math.hypot(p.x, p.y) || 1;
      const px = cx + (compress(p.au) * base * p.x) / dist;
      const py = cy - (compress(p.au) * base * p.y) / dist;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(223,247,255,0.85)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(p.name, px + p.size + 5, py + 3);
      if (p.id === "terre") {
        earthPos = { px, py };
      }
    }

    // La Lune, autour de la Terre
    const moon = moonPosition(now);
    if (moon && earthPos) {
      const md = Math.hypot(moon.x, moon.y) || 1;
      const mx = cx + (compress(md) * base * moon.x) / md;
      const my = cy - (compress(md) * base * moon.y) / md;
      ctx.fillStyle = "#e8e8ec";
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(mx, my, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(223,247,255,0.6)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText("Lune", mx + 5, my + 3);
    }

    ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(`Éphémérides : ${new Date(now).toLocaleString("fr-FR")} — molette : zoom, glisser : déplacer`, 14, h - 14);
  });

  useEffect(() => {
    // Avance le temps (vitesse choisie) : +100 ms réelles * facteur, 10 fois par seconde.
    const tick = setInterval(() => {
      offset.current += 100 * (SPACE_SPEEDS[speedIdx].factor - 1);
    }, 100);
    return () => clearInterval(tick);
  }, [speedIdx]);

  const canvas = ref;
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom.current = Math.min(4, Math.max(0.5, zoom.current * (e.deltaY > 0 ? 0.9 : 1.1)));
    };
    const onDown = (e: PointerEvent) => {
      drag.current = { x: e.clientX - pan.current.x, y: e.clientY - pan.current.y };
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      pan.current = { x: e.clientX - drag.current.x, y: e.clientY - drag.current.y };
    };
    const onUp = () => {
      drag.current = null;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
  }, [canvas]);

  return (
    <div className="relative min-h-0 flex-1">
      <canvas ref={ref} className="h-full w-full cursor-grab touch-none" />
      <div className="absolute right-3 top-3 flex gap-2">
        {SPACE_SPEEDS.map((s, i) => (
          <button key={s.label} type="button" className="hud-btn !h-7 text-xs" data-active={speedIdx === i} onClick={() => setSpeedIdx(i)}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Vue : satellites en direct (globe orthographique) ──────────────── */

export const SAT_SPEEDS: { label: string; factor: number }[] = [
  { label: "Temps réel", factor: 1 },
  { label: "×60", factor: 60 },
  { label: "×600", factor: 600 },
];

export function SatellitesView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [speedIdx, setSpeedIdx] = useState(0);
  const rot = useRef({ lon: 0, tilt: 0.45 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const offset = useRef(0);
  const positions = useRef<{ name: string; group: string; lat: number; lon: number }[]>([]);

  // Temps accéléré : décale la date demandée au serveur (l'ISS bouge alors visiblement).
  useEffect(() => {
    const tick = setInterval(() => {
      offset.current += 100 * (SAT_SPEEDS[speedIdx].factor - 1);
    }, 100);
    return () => clearInterval(tick);
  }, [speedIdx]);

  // Les positions SGP4 sont calculées par le serveur ; la page les redessine à 60 i/s.
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const t = Date.now() + offset.current;
        const r = await fetch(`/api/space?action=positions&t=${t}`, { cache: "no-store" });
        const j = (await r.json()) as { positions?: typeof positions.current; error?: string };
        if (stop) return;
        if (j.positions) {
          positions.current = j.positions;
          setError(null);
          setLoading(false);
        } else setError(j.error ?? "Données satellites indisponibles.");
      } catch {
        if (!stop) setError("Le serveur ne répond pas.");
      }
      if (!stop) timer = setTimeout(poll, 400);
    };
    void poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);

  const ref = useCanvas((ctx, w, h) => {
    const [r, g, b] = hudColor();
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.4;
    const { lon, tilt } = rot.current;
    const project = (latDeg: number, lonDeg: number) => {
      const φ = (latDeg * Math.PI) / 180;
      const λ = ((lonDeg + lon) * Math.PI) / 180;
      const x1 = Math.cos(φ) * Math.sin(λ);
      const y1 = Math.cos(tilt) * Math.sin(φ) - Math.sin(tilt) * Math.cos(φ) * Math.cos(λ);
      const z1 = Math.sin(tilt) * Math.sin(φ) + Math.cos(tilt) * Math.cos(φ) * Math.cos(λ);
      return { x: cx + x1 * R, y: cy - y1 * R, z: z1 };
    };

    ctx.clearRect(0, 0, w, h);

    // Globe
    const globe = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R);
    globe.addColorStop(0, `rgba(${r},${g},${b},0.10)`);
    globe.addColorStop(1, "rgba(0,0,0,0.25)");
    ctx.fillStyle = globe;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // Graticule (méridiens et parallèles, face visible uniquement)
    ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
    ctx.lineWidth = 0.7;
    for (let lonDeg = -180; lonDeg < 180; lonDeg += 30) {
      ctx.beginPath();
      let started = false;
      for (let latDeg = -90; latDeg <= 90; latDeg += 4) {
        const p = project(latDeg, lonDeg);
        if (p.z >= 0) {
          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else ctx.lineTo(p.x, p.y);
        } else started = false;
      }
      ctx.stroke();
    }
    for (let latDeg = -60; latDeg <= 60; latDeg += 30) {
      ctx.beginPath();
      let started = false;
      for (let lonDeg = -180; lonDeg <= 180; lonDeg += 4) {
        const p = project(latDeg, lonDeg);
        if (p.z >= 0) {
          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else ctx.lineTo(p.x, p.y);
        } else started = false;
      }
      ctx.stroke();
    }

    // Satellites — positions rafraîchies par le serveur (400 ms), dessin à 60 i/s.
    let drawn = 0;
    for (const s of positions.current) {
      const p = project(s.lat, s.lon);
      if (p.z < -0.05) continue;
      drawn++;
      const isIss = /ISS/i.test(s.name);
      ctx.globalAlpha = p.z < 0 ? 0.25 : isIss ? 1 : 0.85;
      ctx.fillStyle = isIss ? "#ffffff" : s.group === "starlink" ? `rgba(${r},${g},${b},0.9)` : `rgba(180,220,255,0.9)`;
      ctx.shadowColor = ctx.fillStyle as string;
      ctx.shadowBlur = isIss ? 10 : 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isIss ? 4 : 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (isIss) {
        ctx.fillStyle = "#fff";
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillText("ISS", p.x + 7, p.y + 3);
      }
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(
      `${positions.current.length ? `${drawn} satellites visibles sur ${positions.current.length}` : "chargement des éléments orbitaux…"} — glissez pour tourner le globe`,
      14,
      h - 14,
    );
  });

  const canvas = ref;
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      rot.current.lon += (e.clientX - drag.current.x) * 0.4;
      rot.current.tilt = Math.max(-1.2, Math.min(1.2, rot.current.tilt + (e.clientY - drag.current.y) * 0.005));
      drag.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      drag.current = null;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
  }, [canvas]);

  return (
    <div className="relative min-h-0 flex-1">
      <canvas ref={ref} className="h-full w-full cursor-grab touch-none" />
      <div className="absolute right-3 top-3 flex gap-2">
        {SAT_SPEEDS.map((s, i) => (
          <button key={s.label} type="button" className="hud-btn !h-7 text-xs" data-active={speedIdx === i} onClick={() => setSpeedIdx(i)}>
            {s.label}
          </button>
        ))}
      </div>
      {error && <p className="absolute inset-x-0 top-3 mx-auto w-fit rounded border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs text-red-200">⚠️ {error}</p>}
      {loading && !error && (
        <p className="absolute inset-0 grid place-items-center text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" />
        </p>
      )}
    </div>
  );
}
