// Files offered for download by the web version (Windows installer, source code archive).
import fs from "node:fs";
import path from "node:path";
import { downloadsDir } from "@/lib/runtime";
import type { DownloadItem } from "@/lib/types";

const NAME_RE = /^[\w.\- ]+\.(exe|zip)$/i;

export function listDownloads(): DownloadItem[] {
  const dir = downloadsDir();
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => NAME_RE.test(n))
    .map((n): DownloadItem => {
      const st = fs.statSync(path.join(dir, n));
      const kind = n.toLowerCase().endsWith(".exe") ? "installer" : /source/i.test(n) ? "source" : "other";
      return { name: n, size: st.size, kind, updatedAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function downloadPath(name: string): string | null {
  if (!NAME_RE.test(name) || name.includes("..") || name.includes("/") || name.includes("\\")) return null;
  const full = path.join(downloadsDir(), name);
  return fs.existsSync(full) ? full : null;
}
