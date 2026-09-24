"use client";

import { Check, Copy, Download, ExternalLink, FileCode2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { DownloadItem } from "@/lib/types";
import { Code, formatSize } from "./ui";

/**
 * Liens miroirs externes (Gofile, valables ~10 jours après le dernier téléchargement).
 * L'aperçu intégré arena.site bloque les téléchargements directs : ces liens
 * fonctionnent partout, sans passer par l'aperçu.
 */
const MIRRORS: Record<string, string> = {
  "JARVIS-Setup-1.4.1.exe": "https://gofile.io/d/vnVzKEtD",
  "JARVIS-code-source-1.4.1.zip": "https://gofile.io/d/sJkhaChr",
  "JARVIS-Setup-1.4.0.exe": "https://gofile.io/d/WJM77Onk",
  "JARVIS-code-source-1.4.0.zip": "https://gofile.io/d/oyvlfIsq",
};

function mirrorOf(name: string): string | null {
  return MIRRORS[name] ?? null;
}

function inIframe(): boolean {
  try {
    return typeof window !== "undefined" && window.self !== window.top;
  } catch {
    return true;
  }
}

function useAbsoluteUrl(path: string): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    try {
      setUrl(new URL(path, window.location.href).toString());
    } catch {
      setUrl(path);
    }
  }, [path]);
  return url;
}

async function copyText(text: string): Promise<"ok" | "fail"> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "ok";
    } catch {
      /* fallback below */
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (ok) return "ok";
  } catch {
    /* fallback below */
  }
  try {
    window.prompt("Copiez ce lien de téléchargement :", text);
  } catch {
    /* ignore */
  }
  return "fail";
}

type DlStatus = "idle" | "loading" | "done" | "error";

async function fetchWithProgress(
  url: string,
  expected: number,
  onProgress: (ratio: number, loaded: number) => void,
): Promise<Blob> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let detail = "";
    try {
      detail = ` — ${(await res.text()).slice(0, 160)}`;
    } catch {
      /* ignore */
    }
    throw new Error(`Le serveur a répondu ${res.status}${detail}`);
  }
  const total = Number(res.headers.get("content-length")) || expected || 0;
  const type = res.headers.get("content-type") || "application/octet-stream";
  const reader = res.body?.getReader();
  if (!reader) {
    const blob = await res.blob();
    onProgress(1, blob.size);
    return blob;
  }
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(new Uint8Array(value));
      loaded += value.length;
      onProgress(total > 0 ? loaded / total : -1, loaded);
    }
  }
  return new Blob(chunks, { type });
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 8000);
}

interface Dl {
  status: DlStatus;
  progress: number | null;
  message: string;
  href: string;
  absolute: string;
  start: () => void;
  openDirect: () => void;
}

function useFileDownload(item: DownloadItem): Dl {
  const [status, setStatus] = useState<DlStatus>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const href = `/api/download/${encodeURIComponent(item.name)}`;
  const absolute = useAbsoluteUrl(href);

  const start = async () => {
    if (status === "loading") return;
    setStatus("loading");
    setProgress(0);
    setMessage("Connexion au serveur…");
    try {
      const blob = await fetchWithProgress(href, item.size, (ratio, loaded) => {
        setProgress(ratio >= 0 ? ratio : null);
        setMessage(
          ratio >= 0
            ? `Téléchargement… ${Math.round(ratio * 100)} % (${formatSize(loaded)} / ${formatSize(item.size)})`
            : `Téléchargement… ${formatSize(loaded)}`,
        );
      });
      if (blob.size === 0) throw new Error("Fichier vide reçu du serveur.");
      saveBlob(blob, item.name);
      setStatus("done");
      setProgress(1);
      setMessage(`Terminé ! Ouvrez votre dossier Téléchargements : ${item.name}`);
    } catch (e) {
      setStatus("error");
      setProgress(null);
      setMessage(e instanceof Error ? e.message : "Téléchargement impossible.");
    }
  };

  const openDirect = () => {
    // Note : sans "noreferrer" — arena.site exige le referer, sinon « Aperçu indisponible ».
    const url = absolute || href;
    const w = window.open(url, "_blank");
    if (!w) {
      setStatus("error");
      setMessage("Fenêtre bloquée par le navigateur : utilisez le lien miroir Gofile ci-dessous.");
    }
  };

  return { status, progress, message, href, absolute, start, openDirect };
}

function LinkBox({ absolute, href }: { absolute: string; href: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if ((await copyText(absolute || href)) === "ok") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-slate-400">Lien direct (à copier dans un nouvel onglet si le bouton ne suffit pas) :</div>
      {absolute ? <Code>{absolute}</Code> : <span className="font-mono text-xs text-hud">{href}</span>}
      <button type="button" className="hud-btn !h-8 text-xs" onClick={() => void copy()}>
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Lien copié !" : "Copier le lien direct"}
      </button>
    </div>
  );
}

function ProgressBar({ progress }: { progress: number | null }) {
  if (progress === null) return null;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-hud/10">
      <div className="h-full bg-hud shadow-[0_0_8px_var(--hud)] transition-all duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
    </div>
  );
}

function StatusLine({ status, message }: { status: DlStatus; message: string }) {
  if (!message) return null;
  const cls = status === "error" ? "text-red-300" : status === "done" ? "text-emerald-300" : "text-slate-300";
  return <p className={`text-xs ${cls}`}>{message}</p>;
}

function MirrorButton({ item }: { item: DownloadItem }) {
  const url = mirrorOf(item.name);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title="Lien de secours hébergé chez Gofile — fonctionne partout, même hors de l'aperçu"
      className="hud-btn !h-8 text-xs !text-emerald-200"
    >
      <ExternalLink size={13} /> {item.kind === "installer" ? "Lien miroir Gofile (recommandé si le bouton ne marche pas)" : "Miroir Gofile"}
    </a>
  );
}

function FileDownload({ item, primary = false }: { item: DownloadItem; primary?: boolean }) {
  const dl = useFileDownload(item);
  const Icon = dl.status === "loading" ? Loader2 : item.kind === "installer" ? Download : FileCode2;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void dl.start()}
          disabled={dl.status === "loading"}
          title="Télécharger (si rien ne se passe, utilisez le lien miroir Gofile)"
          className={primary ? "hud-btn-primary inline-flex !py-3 !text-[11px] disabled:opacity-60" : "hud-btn disabled:opacity-60"}
        >
          <span className="inline-flex items-center gap-2">
            <Icon size={primary ? 15 : 14} className={dl.status === "loading" ? "animate-spin" : ""} />
            {item.kind === "installer" ? (
              <>
                Télécharger {item.name} ({formatSize(item.size)})
              </>
            ) : (
              <>Code source ({formatSize(item.size)})</>
            )}
          </span>
        </button>
        <MirrorButton item={item} />
        <button type="button" className="hud-btn !h-8 text-xs" onClick={dl.openDirect} title="Ouvrir le fichier dans un nouvel onglet (reste dans arena)">
          <ExternalLink size={13} /> Ouvrir
        </button>
      </div>
      <ProgressBar progress={dl.progress} />
      <StatusLine status={dl.status} message={dl.message} />
      <LinkBox absolute={dl.absolute} href={dl.href} />
    </div>
  );
}

/** Compact button for the troubleshooting card. */
export function CompactDownloadButton({ item }: { item: DownloadItem }) {
  const dl = useFileDownload(item);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void dl.start()}
        disabled={dl.status === "loading"}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-hud/25 bg-black/30 px-4 py-2.5 text-xs text-slate-100 transition hover:border-hud/50 hover:bg-hud/10 disabled:opacity-60"
      >
        {dl.status === "loading" ? <Loader2 size={14} className="animate-spin" /> : <FileCode2 size={14} />}
        {dl.status === "loading" && dl.progress !== null ? `${Math.round(dl.progress * 100)} %` : "Code source"}
      </button>
      {dl.message && (
        <span className={`text-[11px] ${dl.status === "error" ? "text-red-300" : dl.status === "done" ? "text-emerald-300" : "text-slate-400"}`}>
          {dl.message}
        </span>
      )}
    </span>
  );
}

/** Main installer + source download block for the Installation tab. */
export function InstallerDownloads({ installer, source }: { installer: DownloadItem; source?: DownloadItem }) {
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    setFramed(inIframe());
  }, []);

  return (
    <div className="space-y-4">
      {framed && (
        <div className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
          <b>Vous êtes dans l&apos;aperçu intégré :</b> les téléchargements directs y sont bloqués, et l&apos;adresse arena.site ne marche pas dans un onglet
          seul (« Aperçu indisponible »). <b>Utilisez le lien miroir Gofile</b> : il fonctionne partout, sans passer par l&apos;aperçu.
        </div>
      )}
      <FileDownload item={installer} primary />
      {source && <FileDownload item={source} />}
      <p className="text-xs text-slate-400">
        Fichier de {formatSize(installer.size)} — le téléchargement peut mettre quelques secondes à démarrer. Ensuite, double-cliquez sur le .exe (si Windows
        affiche « Windows a protégé votre ordinateur » : Informations complémentaires → Exécuter quand même).
      </p>
      <details className="rounded-xl border border-hud/20 bg-black/30 px-4 py-3 text-xs">
        <summary className="cursor-pointer text-slate-200">Toujours rien ? Cliquez ici.</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-4 leading-relaxed text-slate-300">
          <li>
            <b className="text-white">Utilisez le lien miroir Gofile</b> : sur la page Gofile, cliquez sur <b className="text-white">Download</b>. C&apos;est la méthode
            qui marche à tous les coups.
          </li>
          <li>
            Regardez la <b className="text-white">barre de téléchargements</b> : Chrome et Edge signalent les .exe — cliquez sur <b className="text-white">⋮ → Conserver</b>.
            Vérifiez aussi votre dossier Téléchargements.
          </li>
          <li>
            N&apos;ouvrez pas l&apos;adresse <span className="font-mono text-hud">arena.site</span> dans un onglet seul : elle n&apos;existe que dans l&apos;aperçu
            (« Aperçu indisponible » sinon).
          </li>
        </ol>
      </details>
    </div>
  );
}
