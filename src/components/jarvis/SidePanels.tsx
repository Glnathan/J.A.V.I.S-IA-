"use client";

import {
  Battery,
  BatteryCharging,
  Bell,
  Brain,
  CalendarClock,
  Check,
  CloudSun,
  Cpu,
  Gauge as GaugeIcon,
  ListTodo,
  Plus,
  Server,
  Timer as TimerIcon,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { AIStatus, MemoryItem, SystemStats, TaskItem, WeatherData } from "@/lib/types";

export interface Timer {
  id: string;
  label: string;
  endsAt: number;
  total: number;
}

function PanelHeader({ icon, title, right }: { icon: ReactNode; title: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-hud">{icon}</span>
      <span className="label !text-[11px]">{title}</span>
      <span className="ml-auto">{right}</span>
    </div>
  );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-hud/10 py-1.5 text-xs last:border-0">
      <span className="flex shrink-0 items-center gap-2 text-slate-400">
        {icon}
        {label}
      </span>
      <span className="truncate text-right font-mono text-slate-200">{value}</span>
    </div>
  );
}

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <div className="hud-panel h-[122px]" />;
  const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const sec = String(now.getSeconds()).padStart(2, "0");
  const date = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="hud-panel p-4">
      <div className="label">Heure locale</div>
      <div className="glow-text mt-1 font-display text-5xl text-hud">
        {time}
        <span className="text-2xl opacity-60">:{sec}</span>
      </div>
      <div className="mt-1 text-sm capitalize text-slate-300">{date}</div>
    </div>
  );
}

function Gauge({ value, label, sub }: { value: number; label: string; sub?: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-20 w-20">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90 text-hud">
          <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="6" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${(v / 100) * c} ${c}`}
            style={{ transition: "stroke-dasharray .8s ease", filter: "drop-shadow(0 0 4px var(--hud))" }}
          />
          <circle cx="40" cy="40" r="25" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeDasharray="1 3" />
        </svg>
        <div className="absolute inset-0 grid place-items-center font-display text-base text-white">
          <span>
            {Math.round(v)}
            <span className="text-[10px]">%</span>
          </span>
        </div>
      </div>
      <div className="label">{label}</div>
      {sub && <div className="font-mono text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: (type: string, cb: () => void) => void;
}

const fmtGb = (b: number) => `${(b / 1073741824).toFixed(1)} Go`;
const fmtUptime = (s: number) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d} j ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
};

export function SystemPanel() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/system", { cache: "no-store" });
        if (r.ok && alive) setStats((await r.json()) as SystemStats);
      } catch {
        /* offline */
      }
    };
    void load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let bat: BatteryLike | null = null;
    const update = () => {
      if (bat) setBattery({ level: Math.round(bat.level * 100), charging: bat.charging });
    };
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    nav
      .getBattery?.()
      .then((b) => {
        bat = b;
        update();
        b.addEventListener("levelchange", update);
        b.addEventListener("chargingchange", update);
      })
      .catch(() => undefined);
    const on = () => setOnline(navigator.onLine);
    on();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      bat?.removeEventListener("levelchange", update);
      bat?.removeEventListener("chargingchange", update);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  const memPct = stats ? ((stats.totalMem - stats.freeMem) / stats.totalMem) * 100 : 0;

  return (
    <div className="hud-panel p-4">
      <PanelHeader icon={<GaugeIcon size={14} />} title="Diagnostic système" right={<span className="font-mono text-[10px] text-emerald-400">● LIVE</span>} />
      <div className="grid grid-cols-2 gap-2">
        <Gauge value={stats?.cpuUsage ?? 0} label="CPU" sub={stats ? `${stats.cores} cœurs` : "…"} />
        <Gauge value={memPct} label="RAM" sub={stats ? `${fmtGb(stats.totalMem - stats.freeMem)} / ${fmtGb(stats.totalMem)}` : "…"} />
      </div>
      <div className="mt-3">
        <Row
          icon={battery?.charging ? <BatteryCharging size={12} /> : <Battery size={12} />}
          label="Batterie"
          value={battery ? `${battery.level} %${battery.charging ? " ⚡" : ""}` : "Secteur / N.D."}
        />
        <Row icon={online ? <Wifi size={12} /> : <WifiOff size={12} />} label="Réseau" value={online ? "En ligne" : "Hors ligne"} />
        <Row icon={<Server size={12} />} label="Hôte" value={stats ? `${stats.platform} · ${stats.hostname}` : "…"} />
        <Row icon={<Cpu size={12} />} label="Processeur" value={stats?.cpuModel ?? "…"} />
        <Row icon={<TimerIcon size={12} />} label="Uptime" value={stats ? fmtUptime(stats.uptime) : "…"} />
      </div>
    </div>
  );
}

export function WeatherWidget({ city }: { city: string }) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/weather?city=${encodeURIComponent(city)}`, { cache: "no-store" });
        const j = (await r.json()) as { data?: WeatherData; error?: string };
        if (!alive) return;
        if (r.ok && j.data) {
          setData(j.data);
          setErr(null);
        } else setErr(j.error ?? "Indisponible");
      } catch {
        if (alive) setErr("Service météo indisponible");
      }
    };
    void load();
    const t = setInterval(load, 15 * 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [city]);

  return (
    <div className="hud-panel p-4">
      <PanelHeader icon={<CloudSun size={14} />} title="Météo" right={<span className="max-w-[140px] truncate text-xs text-slate-300">{data?.city ?? city}</span>} />
      {!data && !err && <p className="font-mono text-xs text-slate-500">Liaison satellite…</p>}
      {err && !data && <p className="text-xs text-slate-400">{err}</p>}
      {data && (
        <>
          <div className="flex items-center gap-3">
            <div className="text-4xl leading-none">{data.current.icon}</div>
            <div>
              <div className="font-display text-3xl text-white">{Math.round(data.current.temp)}°</div>
              <div className="text-xs capitalize text-slate-300">{data.current.desc}</div>
            </div>
            <div className="ml-auto text-right font-mono text-[11px] text-slate-400">
              <div>↑ {Math.round(data.daily[0]?.max ?? data.current.temp)}°</div>
              <div>↓ {Math.round(data.daily[0]?.min ?? data.current.temp)}°</div>
              <div>💨 {Math.round(data.current.wind)} km/h</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {data.daily.slice(1, 5).map((d) => (
              <div key={d.date} className="rounded border border-hud/10 bg-black/20 py-1.5 text-center">
                <div className="label !text-[9px]">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", timeZone: "UTC" })}</div>
                <div className="text-lg">{d.icon}</div>
                <div className="text-[10px] text-slate-300">
                  {Math.round(d.max)}° <span className="text-slate-500">{Math.round(d.min)}°</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AICorePanel({ ai, onConfigure }: { ai: AIStatus | undefined; onConfigure: () => void }) {
  return (
    <div className="hud-panel p-4">
      <PanelHeader icon={<Brain size={14} />} title="Noyau cognitif" />
      {ai?.active ? (
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            <span className="text-sm text-white">{ai.label}</span>
          </div>
          <div className="mt-1 truncate font-mono text-xs text-slate-400">{ai.model}</div>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
            <span className="text-sm text-white">Noyau local</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">Commandes intégrées, météo, actualités et Wikipédia. Connectez une IA (gratuite) pour converser librement.</p>
        </div>
      )}
      <button type="button" onClick={onConfigure} className="hud-btn mt-3 w-full">
        {ai?.active ? "Changer de modèle" : "Connecter une IA"}
      </button>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

export function TimersPanel({ timers, onCancel }: { timers: Timer[]; onCancel: (id: string) => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timers.length) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [timers.length]);
  if (!timers.length) return null;
  return (
    <div className="hud-panel fade-in p-4">
      <PanelHeader icon={<TimerIcon size={14} />} title="Minuteurs actifs" right={<span className="font-mono text-[11px] text-hud">{timers.length}</span>} />
      <ul className="space-y-3">
        {timers.map((t) => {
          const r = Math.max(0, Math.ceil((t.endsAt - now) / 1000));
          const h = Math.floor(r / 3600);
          const m = Math.floor((r % 3600) / 60);
          const s = r % 60;
          const pct = t.total ? Math.min(100, Math.max(0, (r / t.total) * 100)) : 0;
          return (
            <li key={t.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-slate-200">{t.label}</span>
                <span className="flex items-center gap-2">
                  <span className="glow-text font-display text-lg text-hud">{h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}</span>
                  <button type="button" onClick={() => onCancel(t.id)} className="text-slate-500 hover:text-red-400" title="Annuler">
                    <X size={14} />
                  </button>
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded bg-hud/10">
                <div className="h-full bg-hud shadow-[0_0_8px_var(--hud)] transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function dueLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Aujourd'hui ${time}`;
  const tm = new Date(now);
  tm.setDate(now.getDate() + 1);
  if (d.toDateString() === tm.toDateString()) return `Demain ${time}`;
  return `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

interface TasksPanelProps {
  tasks: TaskItem[];
  onAdd: (title: string, dueAt: string | null) => void;
  onToggle: (t: TaskItem) => void;
  onDelete: (id: number) => void;
  onClearDone: () => void;
}

export function TasksPanel({ tasks, onAdd, onToggle, onDelete, onClearDone }: TasksPanelProps) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [showDue, setShowDue] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(i);
  }, []);
  const pending = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    onAdd(t, due ? new Date(due).toISOString() : null);
    setTitle("");
    setDue("");
    setShowDue(false);
  };

  return (
    <div className="hud-panel p-4">
      <PanelHeader icon={<ListTodo size={14} />} title="Tâches & rappels" right={<span className="font-mono text-[11px] text-hud">{pending.length}</span>} />
      <form onSubmit={submit} className="mb-3 space-y-2">
        <div className="flex gap-1.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nouvelle tâche…" className="hud-field !py-1.5" />
          <button type="button" onClick={() => setShowDue((v) => !v)} className="hud-btn !h-9 shrink-0" data-active={showDue} title="Ajouter une échéance">
            <CalendarClock size={15} />
          </button>
          <button type="submit" className="hud-btn !h-9 shrink-0" title="Ajouter">
            <Plus size={15} />
          </button>
        </div>
        {showDue && <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="hud-field !py-1.5" />}
      </form>
      {pending.length === 0 ? (
        <p className="text-xs text-slate-500">Aucune tâche en attente. Dites « rappelle-moi de… » ou ajoutez-en une ci-dessus.</p>
      ) : (
        <ul className="space-y-1">
          {pending.map((t, i) => {
            const overdue = t.dueAt ? Date.parse(t.dueAt) < now : false;
            return (
              <li key={t.id} className="group flex items-start gap-2 rounded border border-transparent px-1.5 py-1 transition hover:border-hud/15 hover:bg-hud/5">
                <button
                  type="button"
                  onClick={() => onToggle(t)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-hud/50 transition hover:bg-hud/25"
                  title="Marquer comme terminée"
                />
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm text-slate-100">
                    <span className="mr-1 font-mono text-[10px] text-hud/60">{i + 1}.</span>
                    {t.title}
                  </div>
                  {t.dueAt && (
                    <div className={`flex items-center gap-1 text-[11px] ${overdue ? "text-red-400" : "text-hud/80"}`}>
                      <Bell size={10} /> {overdue ? "En retard · " : ""}
                      {dueLabel(t.dueAt)}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(t.id)}
                  className="text-slate-500 opacity-60 transition hover:text-red-400 lg:opacity-0 lg:group-hover:opacity-100"
                  title="Supprimer"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {done.length > 0 && (
        <div className="mt-3 border-t border-hud/10 pt-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="label !text-[9px]">Terminées ({done.length})</span>
            <button type="button" onClick={onClearDone} className="text-[11px] text-slate-500 hover:text-red-400">
              Effacer
            </button>
          </div>
          <ul className="space-y-1">
            {done.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-xs text-slate-500">
                <button type="button" onClick={() => onToggle(t)} className="grid h-4 w-4 shrink-0 place-items-center rounded-sm border border-hud/40 bg-hud/20 text-hud" title="Rouvrir">
                  <Check size={10} />
                </button>
                <span className="truncate line-through">{t.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface MemoryPanelProps {
  memories: MemoryItem[];
  onAdd: (content: string) => void;
  onDelete: (id: number) => void;
}

export function MemoryPanel({ memories, onAdd, onDelete }: MemoryPanelProps) {
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText("");
  };
  return (
    <div className="hud-panel p-4">
      <PanelHeader icon={<Brain size={14} />} title="Mémoire à long terme" right={<span className="font-mono text-[11px] text-hud">{memories.length}</span>} />
      <form onSubmit={submit} className="mb-3 flex gap-1.5">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Une information à retenir…" className="hud-field !py-1.5" />
        <button type="submit" className="hud-btn !h-9 shrink-0" title="Mémoriser">
          <Plus size={15} />
        </button>
      </form>
      {memories.length === 0 ? (
        <p className="text-xs text-slate-500">Rien en mémoire. Dites « retiens que… » et je m&apos;en souviendrai, même après redémarrage.</p>
      ) : (
        <ul className="space-y-1">
          {memories.map((m) => (
            <li key={m.id} className="group flex items-start gap-2 rounded px-1.5 py-1 text-sm text-slate-200 hover:bg-hud/5">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-hud" />
              <span className="min-w-0 flex-1 break-words">{m.content}</span>
              <button
                type="button"
                onClick={() => onDelete(m.id)}
                className="text-slate-500 opacity-60 transition hover:text-red-400 lg:opacity-0 lg:group-hover:opacity-100"
                title="Oublier"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
