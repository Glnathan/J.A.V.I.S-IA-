// YouTube helpers shared by the server and the browser (no DOM, no Node APIs).

/** Official AC/DC video, played with YouTube's own embedded player (no file is copied or redistributed). */
export const THUNDERSTRUCK_ID = "v2AC41dglnM";
export const THUNDERSTRUCK_URL = `https://www.youtube.com/watch?v=${THUNDERSTRUCK_ID}`;
export const THUNDERSTRUCK_TITLE = "AC/DC — Thunderstruck";
/**
 * Thunderstruck videos tried in order when the boot music starts: the official video first,
 * then official live versions if YouTube refuses or stalls (all allow embedding, oEmbed 200).
 */
export const THUNDERSTRUCK_IDS = [
  THUNDERSTRUCK_ID, // Official Video (acdcVEVO)
  "n_GFN3a0yj0", // Live At River Plate, December 2009 (acdcVEVO)
  "Af0P6XEkI7Y", // Live at Donington, August 17, 1991 (acdcVEVO)
];

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Extracts the video id from a YouTube link (watch, youtu.be, embed, shorts, music…) or a bare id. */
export function parseYouTubeId(input: string): string | null {
  const s = (input || "").trim();
  if (!s) return null;
  if (ID_RE.test(s)) return s;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return ID_RE.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && ID_RE.test(v)) return v;
    const m = /^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/.exec(url.pathname);
    if (m) return m[1];
  }
  return null;
}

export function canonicalYouTubeUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Friendly label for a boot-music URL. */
export function youTubeLabel(url: string): string {
  const id = parseYouTubeId(url);
  if (!id) return "Vidéo YouTube";
  return THUNDERSTRUCK_IDS.includes(id) ? THUNDERSTRUCK_TITLE : "Vidéo YouTube";
}
