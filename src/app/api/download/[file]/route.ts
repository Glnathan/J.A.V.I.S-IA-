import fs from "node:fs";
import { Readable } from "node:stream";
import { downloadPath } from "@/lib/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ file: string }> };

function resolveName(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function fileHeaders(name: string, size: number): Record<string, string> {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return {
    "Content-Type": name.toLowerCase().endsWith(".zip") ? "application/zip" : "application/octet-stream",
    "Content-Length": String(size),
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

export async function HEAD(_req: Request, { params }: Params) {
  const name = resolveName((await params).file);
  const full = downloadPath(name);
  if (!full) return Response.json({ error: "Fichier introuvable" }, { status: 404 });
  return new Response(null, { status: 200, headers: fileHeaders(name, fs.statSync(full).size) });
}

export async function GET(_req: Request, { params }: Params) {
  const name = resolveName((await params).file);
  const full = downloadPath(name);
  if (!full) return Response.json({ error: "Fichier introuvable" }, { status: 404 });
  const size = fs.statSync(full).size;
  const body = Readable.toWeb(fs.createReadStream(full)) as unknown as ReadableStream<Uint8Array>;
  return new Response(body, { headers: fileHeaders(name, size) });
}
