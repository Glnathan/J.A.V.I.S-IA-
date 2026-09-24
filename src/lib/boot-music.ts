// Custom boot music (the user's own audio file, e.g. a soundtrack they own), stored on disk.
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/runtime";

export interface BootMusicMeta {
  file: string;
  name: string;
  type: string;
  size: number;
  updatedAt: string;
}

const META_FILE = "boot-music.json";
export const BOOT_MUSIC_MAX_BYTES = 30 * 1024 * 1024;

const TYPE_TO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/webm": "webm",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};

const EXT_TO_TYPE: Record<string, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
  aac: "audio/aac",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  flac: "audio/flac",
};

export function detectAudio(name: string, type: string): { ext: string; type: string } | null {
  const t = type.split(";")[0].trim().toLowerCase();
  if (TYPE_TO_EXT[t]) return { ext: TYPE_TO_EXT[t], type: t === "audio/mp3" ? "audio/mpeg" : t };
  const ext = path.extname(name).slice(1).toLowerCase();
  if (EXT_TO_TYPE[ext]) return { ext: ext === "oga" || ext === "opus" ? "ogg" : ext, type: EXT_TO_TYPE[ext] };
  return null;
}

export function getBootMusic(): BootMusicMeta | null {
  try {
    const dir = dataDir();
    const meta = JSON.parse(fs.readFileSync(path.join(dir, META_FILE), "utf8")) as BootMusicMeta;
    if (meta?.file && fs.existsSync(path.join(dir, meta.file))) return meta;
  } catch {
    /* no custom music */
  }
  return null;
}

export function bootMusicPath(meta: BootMusicMeta): string {
  return path.join(dataDir(), meta.file);
}

export function deleteBootMusic(): void {
  const dir = dataDir();
  const meta = getBootMusic();
  if (meta) fs.rmSync(path.join(dir, meta.file), { force: true });
  fs.rmSync(path.join(dir, META_FILE), { force: true });
}

export function saveBootMusic(buf: Buffer, name: string, audio: { ext: string; type: string }): BootMusicMeta {
  deleteBootMusic();
  const dir = dataDir();
  const file = `boot-music.${audio.ext}`;
  fs.writeFileSync(path.join(dir, file), buf);
  const meta: BootMusicMeta = {
    file,
    name: path.basename(name).slice(0, 120) || file,
    type: audio.type,
    size: buf.length,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, META_FILE), JSON.stringify(meta, null, 2));
  return meta;
}
