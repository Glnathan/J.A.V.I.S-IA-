"use client";

import type { ReactNode } from "react";

export function Toggle({
  checked,
  onChange,
  label,
  desc,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`flex w-full items-start gap-3 rounded-md p-2 text-left transition hover:bg-hud/5 ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <span className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition ${checked ? "border-hud bg-hud/40" : "border-white/20 bg-white/5"}`}>
        <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${checked ? "left-[18px] bg-white shadow-[0_0_8px_var(--hud)]" : "left-0.5 bg-slate-400"}`} />
      </span>
      <span>
        <span className="block text-sm text-slate-100">{label}</span>
        {desc && <span className="block text-xs leading-relaxed text-slate-400">{desc}</span>}
      </span>
    </button>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="block overflow-x-auto whitespace-pre rounded border border-hud/20 bg-black/50 px-3 py-2 font-mono text-xs text-hud">{children}</code>;
}

export function Card({ title, children, tone = "default" }: { title: string; children: ReactNode; tone?: "default" | "accent" | "danger" }) {
  const cls = tone === "accent" ? "border-hud/30 bg-hud/5" : tone === "danger" ? "border-red-500/25 bg-red-500/5" : "border-hud/15 bg-black/20";
  return (
    <div className={`space-y-3 rounded border p-4 ${cls}`}>
      <div className="label">{title}</div>
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-xs leading-relaxed text-slate-400">{hint}</span>}
    </label>
  );
}

export const formatSize = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
