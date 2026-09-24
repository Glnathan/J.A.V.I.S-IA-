"use client";

import { AlertTriangle, CheckCircle2, FilePlus2, FolderOpen, Loader2, Puzzle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { PluginsPayload } from "@/lib/types";
import { Card, Code, Toggle } from "./ui";

interface Props {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  /** True in the PC version: plugins run on the user's computer and can be created from here. */
  desktop: boolean;
}

const ORIGIN: Record<string, string> = {
  system: "Python installé sur le système",
  embedded: "Python intégré à JARVIS",
  env: "Python défini par JARVIS_PYTHON",
};

const SAMPLE = `from jarvis import commande

NOM = "Mon premier plugin"

@commande("dis bonjour à {nom}")
def bonjour(req):
    return f"Bonjour {req.groupes['nom']} !"`;

export default function PluginsTab({ enabled, onToggle, desktop }: Props) {
  const [data, setData] = useState<PluginsPayload | null>(null);
  const [busy, setBusy] = useState<string | null>("load");
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const call = async (action: string | null, body?: Record<string, unknown>) => {
    setBusy(action ?? "load");
    setNotice(null);
    try {
      const r = action
        ? await fetch("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) })
        : await fetch("/api/plugins", { cache: "no-store" });
      const j = (await r.json()) as PluginsPayload & { ok?: boolean };
      if (action === "open") {
        if (j.error) setNotice(j.error);
      } else {
        setData(j);
        if (j.created) setNotice(`✅ Plugin créé : ${j.created}. Ouvrez-le dans votre éditeur (ou Antigravity) pour le modifier.`);
        else if (j.error) setNotice(`⚠️ ${j.error}`);
      }
    } catch {
      setNotice("Impossible de joindre le moteur de plugins.");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void call(null);
  }, []);

  return (
    <div className="space-y-5">
      <Toggle
        checked={enabled}
        onChange={onToggle}
        label="Activer les plugins Python"
        desc="Chaque fichier .py du dossier des plugins ajoute des commandes vocales. Les plugins passent avant les commandes intégrées. N'oubliez pas d'enregistrer."
      />

      {!desktop && (
        <div className="flex items-start gap-2 rounded border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-100">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Version en ligne : les plugins s&apos;exécutent sur le serveur de JARVIS, pas sur votre ordinateur. Vous pouvez les voir et les activer, mais pour
            écrire les vôtres et agir sur votre PC, installez la version PC (onglet « Installation », option B).
          </span>
        </div>
      )}

      <Card title="Moteur Python">
        {busy === "load" && !data ? (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 size={14} className="animate-spin" /> Détection de Python…
          </p>
        ) : data?.python.found ? (
          <p className="flex items-center gap-2 text-sm text-emerald-200">
            <CheckCircle2 size={15} /> Python {data.python.version} — {ORIGIN[data.python.origin ?? "system"]}
            <span className="font-mono text-[11px] text-slate-500">({data.python.command})</span>
          </p>
        ) : (
          <div className="flex items-start gap-2 text-sm text-amber-100">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              Python est introuvable. Installez-le depuis{" "}
              <a href="https://www.python.org/downloads/" target="_blank" rel="noreferrer" className="text-hud underline">
                python.org
              </a>{" "}
              en cochant « Add python.exe to PATH », puis cliquez sur Recharger. (L&apos;installateur Windows de JARVIS inclut déjà un Python intégré.)
            </span>
          </div>
        )}
        <div>
          <div className="label mb-1 !text-[9px]">Dossier des plugins</div>
          <Code>{data?.dir ?? "…"}</Code>
        </div>
        <div className="flex flex-wrap gap-2">
          {data?.canOpen && (
            <button type="button" className="hud-btn" onClick={() => void call("open")} disabled={busy !== null}>
              <FolderOpen size={14} /> Ouvrir le dossier
            </button>
          )}
          <button type="button" className="hud-btn" onClick={() => void call("reload")} disabled={busy !== null}>
            {busy === "reload" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Recharger
          </button>
        </div>
        {notice && <p className="text-xs text-slate-200">{notice}</p>}
      </Card>

      <Card title={`Plugins installés (${data?.plugins.length ?? 0})`}>
        {data && data.plugins.length === 0 && <p className="text-sm text-slate-400">Aucun plugin pour le moment.</p>}
        <ul className="space-y-2">
          {data?.plugins.map((p) => (
            <li key={p.file} className={`rounded border p-3 ${p.error ? "border-red-400/40 bg-red-500/5" : "border-hud/15 bg-black/20"}`}>
              <div className="flex items-center gap-2">
                <Puzzle size={14} className="text-hud" />
                <span className="text-sm font-semibold text-white">{p.name}</span>
                <span className="ml-auto font-mono text-[10px] text-slate-500">{p.file}</span>
              </div>
              {p.description && <p className="mt-1 text-xs text-slate-300">{p.description}</p>}
              {p.commands.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.commands.flatMap((c) =>
                    c.patterns.map((pat) => (
                      <span key={`${c.name}-${pat}`} title={c.description} className="rounded-full border border-hud/25 bg-hud/5 px-2 py-0.5 font-mono text-[10px] text-hud">
                        « {pat} »
                      </span>
                    )),
                  )}
                </div>
              )}
              {p.error && <pre className="scroll-hud mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-red-200">{p.error}</pre>}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={desktop ? "Créer un plugin" : "Écrire un plugin"} tone="accent">
        {desktop && (
          <div className="flex gap-2">
            <input className="hud-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du plugin (ex. Domotique salon)" />
            <button type="button" className="hud-btn shrink-0" disabled={busy !== null} onClick={() => void call("create", { name })}>
              <FilePlus2 size={14} /> Créer
            </button>
          </div>
        )}
        <p className="text-xs leading-relaxed text-slate-400">
          {desktop
            ? "Un fichier prêt à modifier est créé dans le dossier des plugins. Voici le plugin le plus simple possible — les modifications sont prises en compte immédiatement, sans redémarrer JARVIS :"
            : "Voici le plugin le plus simple possible. Dans la version PC, il suffit de l'enregistrer dans le dossier des plugins : il est pris en compte immédiatement."}
        </p>
        <Code>{SAMPLE}</Code>
        <p className="text-xs text-slate-400">
          Documentation complète : fichier <span className="font-mono text-hud">LISEZMOI.md</span> du dossier des plugins.
        </p>
      </Card>
    </div>
  );
}
