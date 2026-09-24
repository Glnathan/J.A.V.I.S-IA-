"use client";

import {
  Blinds,
  Bot,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Droplets,
  Fan,
  House,
  Lightbulb,
  Loader2,
  Lock,
  LockOpen,
  Minus,
  Play,
  Plug,
  Plus,
  ScrollText,
  Settings,
  Square,
  Star,
  Thermometer,
  ToggleLeft,
  Tv,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { foldText } from "@/lib/client/recognition";
import type { HomeEntity, HomePayload } from "@/lib/types";

interface Props {
  refreshKey: number;
  onOpenSettings: () => void;
}

const ICONS: Record<string, LucideIcon> = {
  light: Lightbulb,
  switch: Plug,
  cover: Blinds,
  climate: Thermometer,
  fan: Fan,
  media_player: Tv,
  scene: Clapperboard,
  script: ScrollText,
  input_boolean: ToggleLeft,
  lock: Lock,
  vacuum: Bot,
  humidifier: Droplets,
  button: Play,
  input_button: Play,
};
const ONOFF = new Set(["light", "switch", "fan", "input_boolean", "media_player", "humidifier", "automation", "siren", "water_heater"]);
const ON_STATES = new Set(["on", "playing", "open", "unlocked", "cleaning", "heat", "cool", "auto", "heat_cool"]);
const STATE_FR: Record<string, string> = {
  on: "allumé", off: "éteint", open: "ouvert", closed: "fermé", opening: "ouverture…", closing: "fermeture…", locked: "verrouillé",
  unlocked: "déverrouillé", playing: "lecture", paused: "pause", idle: "inactif", standby: "veille", cleaning: "nettoyage",
  docked: "sur sa base", returning: "retour", heat: "chauffe", cool: "clim", auto: "auto", heat_cool: "auto", unavailable: "indisponible",
  unknown: "inconnu", armed_home: "armée", armed_away: "armée", armed_night: "armée", disarmed: "désarmée", triggered: "déclenchée",
};

const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n);

function stateLabel(e: HomeEntity): string {
  if (e.domain === "sensor") {
    const n = Number(e.state);
    return Number.isFinite(n) ? `${fmt(n)}${e.unit ? ` ${e.unit}` : ""}` : (STATE_FR[e.state] ?? e.state);
  }
  if (e.domain === "light" && e.state === "on" && e.brightness !== null) return `allumé · ${e.brightness} %`;
  if (e.domain === "scene" || e.domain === "script" || e.domain === "button" || e.domain === "input_button") return "";
  return STATE_FR[e.state] ?? e.state;
}

export default function HomePanel({ refreshKey, onOpenSettings }: Props) {
  const [data, setData] = useState<HomePayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/home", { cache: "no-store" });
      if (r.ok) setData((await r.json()) as HomePayload);
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const i = setInterval(() => {
      if (!document.hidden) void load();
    }, 20000);
    return () => clearInterval(i);
  }, [load]);

  const act = async (e: HomeEntity, command: string, value?: number) => {
    setBusy(e.id);
    setErr(null);
    try {
      const r = await fetch("/api/home", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "service", entityId: e.id, command, value }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) setErr(j.error ?? "Commande refusée.");
    } catch {
      setErr("Home Assistant injoignable.");
    } finally {
      setBusy(null);
      setTimeout(() => void load(), 700);
    }
  };

  const toggleFavorite = async (e: HomeEntity) => {
    setData((d) => (d ? { ...d, entities: d.entities.map((x) => (x.id === e.id ? { ...x, favorite: !x.favorite } : x)) } : d));
    await fetch("/api/home", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "favorite", entityId: e.id, favorite: !e.favorite }),
    }).catch(() => undefined);
  };

  const list = useMemo(() => {
    const all = data?.entities ?? [];
    const q = foldText(query.trim());
    const filtered = q ? all.filter((e) => foldText(`${e.name} ${e.area ?? ""}`).includes(q)) : all;
    return [...filtered].sort((a, b) => Number(b.favorite) - Number(a.favorite));
  }, [data, query]);
  const shown = expanded || query ? list : list.slice(0, 8);

  const controls = (e: HomeEntity) => {
    const disabled = busy === e.id || e.state === "unavailable";
    if (busy === e.id) return <Loader2 size={14} className="animate-spin text-hud" />;
    if (ONOFF.has(e.domain)) {
      const on = ON_STATES.has(e.state);
      return (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={disabled}
          onClick={() => void act(e, "toggle")}
          className={`relative h-5 w-9 shrink-0 rounded-full border transition disabled:opacity-40 ${on ? "border-hud bg-hud/40" : "border-white/20 bg-white/5"}`}
          title={on ? "Éteindre" : "Allumer"}
        >
          <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${on ? "left-[18px] bg-white shadow-[0_0_8px_var(--hud)]" : "left-0.5 bg-slate-400"}`} />
        </button>
      );
    }
    if (e.domain === "cover" || e.domain === "valve") {
      const locked = e.sensitive && !data?.allowSensitive;
      return (
        <span className="flex gap-1">
          <button type="button" className="hud-btn !h-7 !min-w-7 !px-1" disabled={disabled || locked} onClick={() => void act(e, "open")} title={locked ? "Ouverture bloquée par sécurité" : "Ouvrir"}>
            <ChevronUp size={13} />
          </button>
          {e.domain === "cover" && (
            <button type="button" className="hud-btn !h-7 !min-w-7 !px-1" disabled={disabled} onClick={() => void act(e, "stop")} title="Stop">
              <Square size={11} />
            </button>
          )}
          <button type="button" className="hud-btn !h-7 !min-w-7 !px-1" disabled={disabled} onClick={() => void act(e, "close")} title="Fermer">
            <ChevronDown size={13} />
          </button>
        </span>
      );
    }
    if (e.domain === "lock") {
      const locked = e.state === "locked";
      const blocked = locked && !data?.allowSensitive;
      return (
        <button type="button" className="hud-btn !h-7 !px-2 text-[11px]" disabled={disabled || blocked} onClick={() => void act(e, locked ? "open" : "close")} title={blocked ? "Déverrouillage réservé à la version PC (autorisation requise)" : undefined}>
          {locked ? <LockOpen size={12} /> : <Lock size={12} />} {locked ? "Ouvrir" : "Verrouiller"}
        </button>
      );
    }
    if (e.domain === "climate") {
      const target = e.targetTemperature ?? e.currentTemperature ?? 20;
      return (
        <span className="flex items-center gap-1">
          <button type="button" className="hud-btn !h-7 !min-w-7 !px-1" disabled={disabled} onClick={() => void act(e, "set_temp", target - 0.5)} title="-0,5 °C">
            <Minus size={12} />
          </button>
          <span className="w-12 text-center font-mono text-xs text-white">{fmt(target)}°</span>
          <button type="button" className="hud-btn !h-7 !min-w-7 !px-1" disabled={disabled} onClick={() => void act(e, "set_temp", target + 0.5)} title="+0,5 °C">
            <Plus size={12} />
          </button>
        </span>
      );
    }
    if (["scene", "script", "button", "input_button", "automation"].includes(e.domain)) {
      return (
        <button type="button" className="hud-btn !h-7 !px-2 text-[11px]" disabled={disabled} onClick={() => void act(e, "activate")}>
          <Play size={11} /> Activer
        </button>
      );
    }
    if (e.domain === "vacuum") {
      return (
        <button type="button" className="hud-btn !h-7 !px-2 text-[11px]" disabled={disabled} onClick={() => void act(e, e.state === "cleaning" ? "off" : "on")}>
          {e.state === "cleaning" ? "Retour base" : "Lancer"}
        </button>
      );
    }
    return null;
  };

  return (
    <div className="hud-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <House size={14} className="text-hud" />
        <span className="label !text-[11px]">Maison</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[11px] text-hud">{data?.entities.length ?? "…"}</span>
          <button type="button" className="text-slate-500 hover:text-hud" onClick={onOpenSettings} title="Réglages Home Assistant">
            <Settings size={13} />
          </button>
        </span>
      </div>
      {data?.error && <p className="mb-2 text-xs text-red-300">Home Assistant : {data.error}</p>}
      {err && <p className="mb-2 text-xs text-amber-200">{err}</p>}
      {data && data.entities.length > 6 && (
        <input className="hud-field mb-2 !py-1.5 text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un appareil ou une pièce…" />
      )}
      {!data && <p className="font-mono text-xs text-slate-500">Connexion à Home Assistant…</p>}
      {data && !data.error && data.entities.length === 0 && <p className="text-xs text-slate-500">Aucun appareil pilotable trouvé.</p>}
      <ul className="space-y-1">
        {shown.map((e) => {
          const Icon = ICONS[e.domain] ?? (e.domain === "sensor" ? (e.deviceClass === "humidity" ? Droplets : Thermometer) : Zap);
          const on = ON_STATES.has(e.state);
          const label = stateLabel(e);
          return (
            <li key={e.id} className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-hud/5">
              <button type="button" onClick={() => void toggleFavorite(e)} title={e.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}>
                <Star size={11} className={e.favorite ? "fill-hud text-hud" : "text-slate-600 opacity-60 group-hover:opacity-100"} />
              </button>
              <Icon size={14} className={on ? "shrink-0 text-hud drop-shadow-[0_0_6px_var(--hud)]" : "shrink-0 text-slate-500"} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-slate-100">{e.name}</div>
                <div className="truncate text-[10px] text-slate-500">
                  {[e.area, e.domain === "climate" && e.currentTemperature !== null ? `${fmt(e.currentTemperature)} °C` : "", label].filter(Boolean).join(" · ")}
                </div>
              </div>
              {controls(e)}
            </li>
          );
        })}
      </ul>
      {!query && list.length > 8 && (
        <button type="button" className="mt-2 w-full text-center text-[11px] text-slate-500 hover:text-hud" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Réduire" : `Afficher les ${list.length} appareils`}
        </button>
      )}
    </div>
  );
}
