"use client";

// Vues Espace partagées : panneau intégré de JARVIS (SpacePanel) et page /espace.
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { moonPosition, solarSystem } from "@/lib/solar";

function drawSpace(ctx:CanvasRenderingContext2D,w:number,h:number){
 ctx.fillStyle='#020611';ctx.fillRect(0,0,w,h);const glow=ctx.createRadialGradient(w*.65,h*.3,0,w*.65,h*.3,w*.7);glow.addColorStop(0,'#10213b');glow.addColorStop(1,'#020611');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
 for(let i=0;i<180;i++){const x=((i*73.719)%1)*w,y=((i*31.317)%1)*h;ctx.fillStyle=i%7===0?'#b9deef':'#5b6c8c';ctx.beginPath();ctx.arc(x,y,i%11===0?1.2:.55,0,Math.PI*2);ctx.fill();}
}

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
    let lastFrame = 0;
    const render = (stamp: number) => {
      if(document.hidden || stamp-lastFrame<32){raf=requestAnimationFrame(render);return;}lastFrame=stamp;
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
  { label: "Maintenant · ×1", factor: 1 },
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
    const base = Math.min(w, h) * 0.105 * zoom.current;
    drawSpace(ctx,w,h);
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
      const sphere=ctx.createRadialGradient(px-p.size*.35,py-p.size*.4,0,px,py,p.size*1.2);sphere.addColorStop(0,'#fff0d8');sphere.addColorStop(.3,p.color);sphere.addColorStop(1,'#070b17');ctx.fillStyle=sphere;
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if(p.id==='saturne'){ctx.strokeStyle='#c6ab76aa';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(px,py,p.size*1.9,p.size*.65,-.4,0,Math.PI*2);ctx.stroke();}
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
    ctx.fillText(`Calcul képlérien : ${new Date(now).toLocaleString("fr-FR")} — dimensions et distances visuelles non à l’échelle`, 14, h - 14);
  });

  useEffect(() => {
    // Avance le temps (vitesse choisie) : +100 ms réelles * facteur, 10 fois par seconde.
    let last=Date.now();
    const tick = setInterval(() => {
      const now=Date.now(); offset.current += (now-last) * (SPACE_SPEEDS[speedIdx].factor - 1);last=now;
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
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
  }, [canvas]);

  return (
    <div className="relative min-h-0 flex-1">
      <canvas ref={ref} className="h-full w-full cursor-grab touch-none" />
      <div className="absolute right-3 top-3 flex gap-2">
        {SPACE_SPEEDS.map((s, i) => (
          <button key={s.label} type="button" className="hud-btn !h-7 text-xs" data-active={speedIdx === i} onClick={() => { offset.current=0; setSpeedIdx(i); }}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Vue : satellites en direct (globe orthographique) ──────────────── */

export const SAT_SPEEDS: { label: string; factor: number }[] = [
  { label: "Maintenant · ×1", factor: 1 },
  { label: "×60", factor: 60 },
  { label: "×600", factor: 600 },
];

export function SatellitesView(){return <iframe src="/earth-dashboard.html" title="Terre et satellites publics" className="min-h-0 w-full flex-1 rounded-xl border-0"/>;}

export function LegacySatellitesView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [speedIdx, setSpeedIdx] = useState(0);
  const rot = useRef({ lon: 0, tilt: 0.45 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const offset = useRef(0);
  const positions = useRef<{ name: string; group: string; lat: number; lon: number; altKm?:number }[]>([]);
  const land=useRef<number[][][]>([]);const zoom=useRef(1);const [details,setDetails]=useState('Chargement du catalogue…');
  useEffect(()=>{fetch('/earth-land.json').then(r=>r.json()).then(d=>{land.current=d.features.flatMap((f:{geometry:{type:string;coordinates:number[][][]|number[][][][]}})=>f.geometry.type==='Polygon'?f.geometry.coordinates:(f.geometry.coordinates as number[][][][]).flat());}).catch(()=>{});},[]);

  // Temps accéléré : décale la date demandée au serveur (l'ISS bouge alors visiblement).
  useEffect(() => {
    let last=Date.now();
    const tick = setInterval(() => {
      const now=Date.now(); offset.current += (now-last) * (SAT_SPEEDS[speedIdx].factor - 1);last=now;
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
        const j = (await r.json()) as { positions?: typeof positions.current; error?: string; catalogue?:{fetchedAt:string|null;stale:boolean;warning:string;oldestEpoch?:string}; at?:string };
        if (stop) return;
        if (r.ok && j.positions?.length) {
          positions.current = j.positions;
          setError(null);
          setDetails('Positions SGP4 estimées · '+j.positions.length+' objets · calcul '+new Date(j.at||Date.now()).toLocaleTimeString('fr-FR')+' · catalogue '+(j.catalogue?.fetchedAt?new Date(j.catalogue.fetchedAt).toLocaleString('fr-FR'):'date inconnue')+(j.catalogue?.oldestEpoch?' · éléments depuis '+new Date(j.catalogue.oldestEpoch+'Z').toLocaleDateString('fr-FR'):'')+(j.catalogue?.warning?' · '+j.catalogue.warning:''));
          setLoading(false);
        } else {setLoading(false);setError(j.error ?? "Aucune donnée satellite disponible. Le globe reste consultable.");}
      } catch {
        if (!stop) setError("Le serveur ne répond pas.");
      }
      if (!stop) timer = setTimeout(poll, 1000);
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
    const R = Math.min(w, h) * 0.32 * zoom.current;
    const { lon, tilt } = rot.current;
    const project = (latDeg: number, lonDeg: number, radius=1) => {
      const φ = (latDeg * Math.PI) / 180;
      const λ = ((lonDeg + lon) * Math.PI) / 180;
      const x1 = Math.cos(φ) * Math.sin(λ);
      const y1 = Math.cos(tilt) * Math.sin(φ) - Math.sin(tilt) * Math.cos(φ) * Math.cos(λ);
      const z1 = Math.sin(tilt) * Math.sin(φ) + Math.cos(tilt) * Math.cos(φ) * Math.cos(λ);
      return { x: cx + x1 * R*radius, y: cy - y1 * R*radius, z: z1 };
    };

    drawSpace(ctx,w,h);

    // Globe
    const globe = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R);
    globe.addColorStop(0, "#197598");globe.addColorStop(.55,"#0a354f");
    globe.addColorStop(1, "#020b1b");
    ctx.fillStyle = globe;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    const halo=ctx.createRadialGradient(cx,cy,R*.98,cx,cy,R*1.13);halo.addColorStop(0,'#46ccff55');halo.addColorStop(1,'#46ccff00');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(cx,cy,R*1.13,0,Math.PI*2);ctx.arc(cx,cy,R,0,Math.PI*2,true);ctx.fill();
    ctx.strokeStyle='#82cbb5';ctx.lineWidth=1;
    for(const ring of land.current){ctx.beginPath();let started=false;for(const [lng,lat] of ring){const p=project(lat,lng);if(p.z<0){started=false;continue;}if(started)ctx.lineTo(p.x,p.y);else{ctx.moveTo(p.x,p.y);started=true;}}ctx.stroke();}
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
      const p = project(s.lat, s.lon,1+(s.altKm??0)/6371);
      if (p.z < 0 && Math.hypot(p.x-cx,p.y-cy)<R) continue;
      if(p.x<0||p.x>w||p.y<0||p.y>h)continue;
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
      `${positions.current.length ? `${drawn} satellites visibles sur ${positions.current.length}` : "chargement des éléments orbitaux…"} — glisser : tourner · molette : zoom`,
      14,
      h - 14,
    );
  });

  const canvas = ref;
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel=(e:WheelEvent)=>{e.preventDefault();zoom.current=Math.max(.18,Math.min(2.2,zoom.current*(e.deltaY>0?.9:1.1)));};
    el.addEventListener("wheel",onWheel,{passive:false});
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
      el.removeEventListener("wheel",onWheel);
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
          <button key={s.label} type="button" className="hud-btn !h-7 text-xs" data-active={speedIdx === i} onClick={() => { offset.current=0; setSpeedIdx(i); }}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="absolute left-3 top-12 right-3 rounded bg-black/60 px-3 py-2 text-xs text-cyan-100" role="status">{speedIdx===0?"HORLOGE ACTUELLE":"SIMULATION ACCÉLÉRÉE"} · {details}. Positions calculées, pas de vidéo en direct.</p>
      {error && <p className="absolute inset-x-0 top-28 mx-auto w-fit rounded border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs text-red-200">⚠️ {error}</p>}
      {loading && !error && (
        <p className="absolute inset-0 grid place-items-center text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" />
        </p>
      )}
    </div>
  );
}
