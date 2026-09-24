"use client";

import { MessageSquare, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConversationItem } from "@/lib/types";

interface Props {
  currentId: number | null;
  onClose: () => void;
  onSelect: (id: number) => void;
  onDeletedCurrent: () => void;
}

function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Aujourd'hui, ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Hier, ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function HistoryDrawer({ currentId, onClose, onSelect, onDeletedCurrent }: Props) {
  const [items, setItems] = useState<ConversationItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/conversations", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ConversationItem[]>) : []))
      .then((d) => {
        if (alive) setItems(d);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const remove = async (id: number) => {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setItems((it) => (it ?? []).filter((x) => x.id !== id));
    if (id === currentId) onDeletedCurrent();
  };

  const clearAll = async () => {
    if (!window.confirm("Effacer tout l'historique des conversations ?")) return;
    await fetch("/api/conversations", { method: "DELETE" });
    setItems([]);
    onDeletedCurrent();
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="hud-panel slide-in relative z-10 flex h-full w-[min(92vw,380px)] flex-col !rounded-none p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="label !text-xs">Historique des sessions</div>
          <button type="button" className="hud-btn" onClick={onClose} title="Fermer">
            <X size={16} />
          </button>
        </div>
        <div className="scroll-hud min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {items === null && <p className="font-mono text-xs text-slate-500">Chargement des archives…</p>}
          {items?.length === 0 && <p className="text-sm text-slate-400">Aucune conversation archivée pour le moment.</p>}
          {items?.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-2 rounded border px-3 py-2 transition ${c.id === currentId ? "border-hud/60 bg-hud/15" : "border-hud/10 bg-black/20 hover:border-hud/40 hover:bg-hud/5"}`}
            >
              <button type="button" onClick={() => onSelect(c.id)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                <MessageSquare size={14} className="mt-0.5 shrink-0 text-hud" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-100">{c.title}</span>
                  <span className="block font-mono text-[10px] text-slate-500">{when(c.updatedAt)}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void remove(c.id)}
                className="text-slate-500 opacity-70 transition hover:text-red-400 lg:opacity-0 lg:group-hover:opacity-100"
                title="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        {items && items.length > 0 && (
          <button type="button" onClick={() => void clearAll()} className="hud-btn mt-3 w-full !text-red-300 hover:!text-red-200">
            <Trash2 size={14} /> Tout effacer
          </button>
        )}
      </aside>
    </div>
  );
}
