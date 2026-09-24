import fs from "node:fs";
import { Readable } from "node:stream";
import { BOOT_MUSIC_MAX_BYTES, bootMusicPath, deleteBootMusic, detectAudio, getBootMusic, saveBootMusic } from "@/lib/boot-music";
import { getSettings, updateSettings } from "@/lib/brain/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const meta = getBootMusic();
  if (!meta) return Response.json({ error: "Aucune musique personnalisée" }, { status: 404 });
  const full = bootMusicPath(meta);
  const size = fs.statSync(full).size;
  const body = Readable.toWeb(fs.createReadStream(full)) as unknown as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: { "Content-Type": meta.type, "Content-Length": String(size), "Cache-Control": "no-cache" },
  });
}

export async function PUT(req: Request) {
  const rawName = req.headers.get("x-file-name") ?? "musique.mp3";
  let name = rawName;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    /* keep raw */
  }
  const audio = detectAudio(name, req.headers.get("content-type") ?? "");
  if (!audio) {
    return Response.json({ error: "Format non pris en charge. Utilisez un fichier MP3, OGG, WAV, M4A, AAC, FLAC ou WEBM." }, { status: 415 });
  }
  const tooBig = { error: `Fichier trop volumineux (maximum ${BOOT_MUSIC_MAX_BYTES / 1048576} Mo).` };
  if (Number(req.headers.get("content-length") ?? "0") > BOOT_MUSIC_MAX_BYTES) return Response.json(tooBig, { status: 413 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return Response.json({ error: "Fichier vide." }, { status: 400 });
  if (buf.length > BOOT_MUSIC_MAX_BYTES) return Response.json(tooBig, { status: 413 });
  const meta = saveBootMusic(buf, name, audio);
  await updateSettings({ bootMusic: "custom" });
  return Response.json({ ok: true, file: { name: meta.name, size: meta.size } });
}

export async function DELETE() {
  deleteBootMusic();
  const s = await getSettings();
  if (s.bootMusic === "custom") await updateSettings({ bootMusic: "theme" });
  return Response.json({ ok: true });
}
