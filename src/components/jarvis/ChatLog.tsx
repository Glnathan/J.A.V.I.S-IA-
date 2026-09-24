"use client";

import { Cpu, ExternalLink, MemoryStick, Newspaper, Server } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { Card, SystemStats, WeatherData } from "@/lib/types";

export interface UIMessage {
  id: string;
  role: "user" | "assistant" | "notice";
  content: string;
  cards?: Card[];
  source?: string;
  provider?: string;
  pending?: boolean;
  error?: boolean;
  createdAt: number;
  blocked?: { label: string; url: string }[];
  via?: "voice" | "text";
}

export function stripTags(t: string): string {
  return t.replace(/\[\[[^\]]*\]\]/g, "").replace(/\[\[[^\]]*$/, "");
}

const SOURCE_LABEL: Record<string, string> = {
  local: "Noyau local",
  llm: "IA",
  weather: "Météo",
  wiki: "Wikipédia",
  news: "Actualités",
  memory: "Mémoire",
  pc: "Contrôle PC",
  plugin: "Plugin Python",
  home: "Maison",
};

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s)]+)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**"))
      out.push(
        <strong key={`${key}-${i++}`} className="font-semibold text-white">
          {tok.slice(2, -2)}
        </strong>,
      );
    else if (tok.startsWith("`"))
      out.push(
        <code key={`${key}-${i++}`} className="rounded bg-black/40 px-1 py-0.5 font-mono text-[0.85em] text-hud">
          {tok.slice(1, -1)}
        </code>,
      );
    else
      out.push(
        <a key={`${key}-${i++}`} href={tok} target="_blank" rel="noreferrer" className="break-all text-hud underline underline-offset-2">
          {tok}
        </a>,
      );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const st: { list: { ordered: boolean; items: string[] } | null; code: string[] | null } = { list: null, code: null };
  const flushList = () => {
    const l = st.list;
    if (!l) return;
    const k = `b${blocks.length}`;
    const items = l.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>);
    blocks.push(
      l.ordered ? (
        <ol key={k} className="list-decimal space-y-0.5 pl-5 marker:text-hud">
          {items}
        </ol>
      ) : (
        <ul key={k} className="list-disc space-y-0.5 pl-5 marker:text-hud">
          {items}
        </ul>
      ),
    );
    st.list = null;
  };
  const pushCode = (lines: string[]) =>
    blocks.push(
      <pre key={`b${blocks.length}`} className="scroll-hud overflow-x-auto rounded border border-hud/20 bg-black/50 p-3 font-mono text-xs text-slate-200">
        {lines.join("\n")}
      </pre>,
    );

  for (const line of text.split("\n")) {
    if (line.trim().startsWith("```")) {
      if (st.code) {
        pushCode(st.code);
        st.code = null;
      } else {
        flushList();
        st.code = [];
      }
      continue;
    }
    if (st.code) {
      st.code.push(line);
      continue;
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const item = ul ?? ol;
    if (item) {
      const ordered = !ul;
      if (!st.list || st.list.ordered !== ordered) {
        flushList();
        st.list = { ordered, items: [] };
      }
      st.list.items.push(item[1]);
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    const k = `b${blocks.length}`;
    blocks.push(
      <p key={k} className={h ? "font-semibold text-white" : undefined}>
        {inline(h ? h[1] : line, k)}
      </p>,
    );
  }
  if (st.code) pushCode(st.code);
  flushList();
  return <div className="space-y-2 leading-relaxed">{blocks}</div>;
}

const weekdayShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", timeZone: "UTC" });

export function WeatherCard({ data }: { data: WeatherData }) {
  return (
    <div className="hud-card mt-2 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="text-5xl leading-none">{data.current.icon}</div>
        <div>
          <div className="font-display text-3xl text-hud">{Math.round(data.current.temp)}°C</div>
          <div className="text-sm capitalize text-slate-300">{data.current.desc}</div>
        </div>
        <div className="ml-auto text-right text-xs text-slate-400">
          <div className="text-sm text-slate-100">
            {data.city}
            {data.country ? `, ${data.country}` : ""}
          </div>
          <div>
            Ressenti {Math.round(data.current.feels)}° · Humidité {Math.round(data.current.humidity)} %
          </div>
          <div>Vent {Math.round(data.current.wind)} km/h</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {data.daily.slice(0, 5).map((d) => (
          <div key={d.date} className="rounded border border-hud/15 bg-black/20 p-1.5 text-center">
            <div className="label !text-[9px]">{weekdayShort(d.date)}</div>
            <div className="text-xl">{d.icon}</div>
            <div className="text-xs">
              <span className="text-white">{Math.round(d.max)}°</span> <span className="text-slate-500">{Math.round(d.min)}°</span>
            </div>
            {d.rain !== null && <div className="text-[10px] text-sky-300">💧{d.rain}%</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemCard({ stats, battery }: { stats: SystemStats; battery?: { level: number; charging: boolean } | null }) {
  const used = stats.totalMem - stats.freeMem;
  const memPct = stats.totalMem ? Math.round((used / stats.totalMem) * 100) : 0;
  const bar = (pct: number) => (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-hud/10">
      <div className="h-full bg-hud shadow-[0_0_8px_var(--hud)]" style={{ width: `${pct}%` }} />
    </div>
  );
  return (
    <div className="hud-card mt-2 space-y-3 p-4 text-xs">
      <div>
        <div className="flex justify-between text-slate-300">
          <span className="flex items-center gap-1.5">
            <Cpu size={12} /> Processeur ({stats.cores} cœurs)
          </span>
          <span className="font-mono text-white">{stats.cpuUsage} %</span>
        </div>
        {bar(stats.cpuUsage)}
      </div>
      <div>
        <div className="flex justify-between text-slate-300">
          <span className="flex items-center gap-1.5">
            <MemoryStick size={12} /> Mémoire vive
          </span>
          <span className="font-mono text-white">
            {(used / 1073741824).toFixed(1)} / {(stats.totalMem / 1073741824).toFixed(1)} Go
          </span>
        </div>
        {bar(memPct)}
      </div>
      {battery && (
        <div>
          <div className="flex justify-between text-slate-300">
            <span>Batterie{battery.charging ? " (en charge)" : ""}</span>
            <span className="font-mono text-white">{battery.level} %</span>
          </div>
          {bar(battery.level)}
        </div>
      )}
      <div className="flex items-center gap-1.5 text-slate-400">
        <Server size={12} /> {stats.platform} · {stats.hostname} · {stats.cpuModel}
      </div>
    </div>
  );
}

export function CardView({ card }: { card: Card }) {
  switch (card.kind) {
    case "weather":
      return <WeatherCard data={card.data} />;
    case "wiki":
      return (
        <a href={card.url} target="_blank" rel="noreferrer" className="hud-card mt-2 flex gap-3 p-3 transition hover:border-hud/50">
          {card.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.thumbnail} alt={card.title} className="h-20 w-20 shrink-0 rounded object-cover" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
              {card.title} <ExternalLink size={12} className="text-hud" />
            </div>
            <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-slate-300">{card.extract}</p>
            <div className="mt-1 text-[10px] uppercase tracking-widest text-hud/60">Wikipédia</div>
          </div>
        </a>
      );
    case "news":
      return (
        <div className="hud-card mt-2 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-hud/70">
            <Newspaper size={12} /> {card.source}
          </div>
          <ul className="space-y-1.5">
            {card.items.map((it) => (
              <li key={it.link || it.title}>
                <a href={it.link} target="_blank" rel="noreferrer" className="group flex items-start gap-2 text-sm text-slate-200 hover:text-white">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-hud" />
                  <span className="group-hover:underline">{it.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      );
    case "links":
      return (
        <div className="mt-2 flex flex-wrap gap-2">
          {card.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="hud-btn !h-8">
              {l.label} <ExternalLink size={12} />
            </a>
          ))}
        </div>
      );
    case "list":
      return (
        <div className="hud-card mt-2 p-3">
          <div className="label mb-2">{card.title}</div>
          {card.ordered ? (
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-200 marker:text-hud">
              {card.items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ol>
          ) : (
            <ul className="space-y-1 text-sm text-slate-200">
              {card.items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          )}
        </div>
      );
    case "system":
      return <SystemCard stats={card.stats} battery={card.battery} />;
    default:
      return null;
  }
}

function Typing() {
  return (
    <span className="inline-flex items-center py-1" aria-label="Jarvis réfléchit">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="typing-bar" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  );
}

function MessageRow({ m }: { m: UIMessage }) {
  const time = new Date(m.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (m.role === "notice") {
    return (
      <div className="animate-msg mx-auto max-w-lg rounded border border-hud/25 bg-hud/5 px-3 py-2 text-center font-mono text-xs text-hud">
        {m.content} <span className="text-slate-500">· {time}</span>
      </div>
    );
  }
  if (m.role === "user") {
    return (
      <div className="animate-msg flex justify-end">
        <div className="max-w-[85%]">
          <div className="label mb-1 text-right">
            Vous · {time}
            {m.via === "voice" ? " · 🎙" : ""}
          </div>
          <div className="whitespace-pre-wrap rounded-lg rounded-tr-none border border-white/10 bg-white/[0.06] px-4 py-2.5 text-slate-100">{m.content}</div>
        </div>
      </div>
    );
  }
  const text = stripTags(m.content);
  const src = m.provider ?? (m.source ? SOURCE_LABEL[m.source] ?? m.source : "");
  return (
    <div className="animate-msg flex gap-3">
      <div className="mt-5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-hud/50 bg-hud/10 shadow-[0_0_12px_var(--hud)]">
        <div className="h-3 w-3 rounded-full bg-hud shadow-[0_0_10px_var(--hud)]" />
      </div>
      <div className="min-w-0 max-w-[92%] flex-1">
        <div className="label mb-1 truncate">
          Jarvis · {time}
          {src ? ` · ${src}` : ""}
        </div>
        <div className={`hud-bubble ${m.error ? "!border-red-500/50 !bg-red-500/10" : ""}`}>
          {text ? <RichText text={text} /> : m.pending ? <Typing /> : null}
          {m.pending && text ? <span className="caret" /> : null}
        </div>
        {m.cards?.map((c, i) => <CardView key={i} card={c} />)}
        {m.blocked?.length ? (
          <div className="mt-2 rounded border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100">
            <p className="mb-2">Votre navigateur a bloqué l&apos;ouverture automatique. Cliquez ci-dessous, ou autorisez les fenêtres pop-up pour ce site :</p>
            <div className="flex flex-wrap gap-2">
              {m.blocked.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="hud-btn !h-8">
                  {l.label} <ExternalLink size={12} />
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ChatLog({ messages }: { messages: UIMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, last?.content, last?.cards, last?.blocked]);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-1 py-4">
      {messages.map((m) => (
        <MessageRow key={m.id} m={m} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
