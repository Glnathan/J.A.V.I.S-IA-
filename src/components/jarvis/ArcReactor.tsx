"use client";

import { useEffect, useId, useRef, type MutableRefObject } from "react";

export type OrbState = "idle" | "standby" | "listening" | "thinking" | "speaking";

interface Props {
  state: OrbState;
  levelRef: MutableRefObject<number>;
  className?: string;
  onClick?: () => void;
  title?: string;
}

const SEGMENTS = Array.from({ length: 10 }, (_, i) => i * 36);
const TICKS = Array.from({ length: 60 }, (_, i) => i * 6);
const BARS = Array.from({ length: 48 }, (_, i) => i * 7.5);

export default function ArcReactor({ state, levelRef, className = "", onClick, title }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rings = useRef<(SVGGElement | null)[]>([]);
  const bars = useRef<(SVGLineElement | null)[]>([]);
  const barLvls = useRef<number[]>(BARS.map(() => 0));
  const core = useRef<SVGCircleElement | null>(null);
  const halo = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<OrbState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const angles = [0, 0, 0, 0, 0];
    const speeds = [4, -9, 22, -5, 14];
    let mult = 1;
    let lvl = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const target = st === "thinking" ? 5.5 : st === "listening" ? 2.4 : st === "speaking" ? 1.8 : st === "standby" ? 0.7 : 1;
      mult += (target - mult) * Math.min(1, dt * 2.5);
      let raw = levelRef.current;
      if (st === "speaking") raw = Math.max(raw, 0.28 + 0.22 * Math.abs(Math.sin(now / 95) * Math.sin(now / 233)));
      if (st === "thinking") raw = Math.max(raw, 0.15 + 0.1 * Math.sin(now / 160));
      lvl += (raw - lvl) * Math.min(1, dt * 10);
      if (st !== "listening") levelRef.current = Math.max(0, levelRef.current - dt * 1.8);
      for (let i = 0; i < BARS.length; i++) {
        const phase = i * 0.83;
        const target = lvl * (0.3 + 0.7 * Math.abs(Math.sin(now / 150 + phase) * Math.cos(now / 470 + phase * 2)));
        const bl = barLvls.current;
        bl[i] += (target - bl[i]) * Math.min(1, dt * 16);
        const len = 3 + bl[i] * 24;
        bars.current[i]?.setAttribute("y2", (90 + len).toFixed(2));
        bars.current[i]?.setAttribute("opacity", (0.3 + bl[i] * 0.7).toFixed(3));
      }
      for (let i = 0; i < angles.length; i++) {
        angles[i] = (angles[i] + speeds[i] * mult * dt + 360) % 360;
        rings.current[i]?.setAttribute("transform", `rotate(${angles[i].toFixed(2)} 200 200)`);
      }
      const breathe = st === "idle" || st === "standby" ? (Math.sin(now / 1100) + 1) * 0.05 : 0;
      core.current?.setAttribute("r", (44 * (1 + lvl * 0.22 + breathe)).toFixed(2));
      if (halo.current) {
        halo.current.style.opacity = String(Math.min(1, 0.45 + lvl * 0.7 + breathe * 2));
        halo.current.style.transform = `scale(${(1 + lvl * 0.3 + breathe).toFixed(3)})`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);

  return (
    <div className={`relative aspect-square select-none ${className}`} data-state={state}>
      <div ref={halo} className="pointer-events-none absolute inset-[18%] rounded-full bg-hud/40 blur-3xl" />
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={title ?? "J.A.R.V.I.S."}
        disabled={!onClick}
        className="relative block h-full w-full cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-hud/60 disabled:cursor-default"
      >
        <svg viewBox="0 0 400 400" className="h-full w-full overflow-visible text-hud">
          <defs>
            <radialGradient id={`${uid}-core`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="58%" stopColor="currentColor" stopOpacity="0.9" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
            <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g ref={(el) => { rings.current[0] = el; }} opacity="0.55">
            {TICKS.map((a) => (
              <line
                key={a}
                x1="200"
                y1="6"
                x2="200"
                y2={a % 30 === 0 ? 22 : 14}
                stroke="currentColor"
                strokeWidth={a % 30 === 0 ? 2 : 1}
                transform={`rotate(${a} 200 200)`}
              />
            ))}
          </g>

          <g ref={(el) => { rings.current[1] = el; }} filter={`url(#${uid}-glow)`}>
            <circle cx="200" cy="200" r="178" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="70 16 10 16" opacity="0.8" />
          </g>

          <g ref={(el) => { rings.current[2] = el; }}>
            <circle cx="200" cy="200" r="156" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="210 117" opacity="0.45" />
            <circle cx="200" cy="200" r="156" fill="none" stroke="#ffffff" strokeWidth="1" strokeDasharray="210 117" opacity="0.5" />
          </g>

          <circle cx="200" cy="200" r="138" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />

          <g ref={(el) => { rings.current[3] = el; }}>
            <circle cx="200" cy="200" r="124" fill="none" stroke="currentColor" strokeWidth="10" strokeDasharray="2 5" opacity="0.28" />
          </g>

          <g ref={(el) => { rings.current[4] = el; }} filter={`url(#${uid}-glow)`}>
            {SEGMENTS.map((a) => (
              <rect
                key={a}
                x="191"
                y="76"
                width="18"
                height="30"
                rx="3"
                fill="currentColor"
                fillOpacity="0.18"
                stroke="currentColor"
                strokeWidth="1.5"
                transform={`rotate(${a} 200 200)`}
              />
            ))}
          </g>

          <g filter={`url(#${uid}-glow)`}>
            {BARS.map((a, i) => (
              <line
                key={a}
                ref={(el) => { bars.current[i] = el; }}
                x1="200"
                y1="90"
                x2="200"
                y2="94"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.3"
                transform={`rotate(${a} 200 200)`}
              />
            ))}
          </g>

          <circle cx="200" cy="200" r="84" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.7" filter={`url(#${uid}-glow)`} />
          <circle cx="200" cy="200" r="70" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 4" opacity="0.5" />
          <circle ref={core} cx="200" cy="200" r="44" fill={`url(#${uid}-core)`} filter={`url(#${uid}-glow)`} />
          <circle cx="200" cy="200" r="16" fill="#ffffff" opacity="0.9" />
        </svg>
      </button>
    </div>
  );
}
