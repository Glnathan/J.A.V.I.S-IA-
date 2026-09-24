// Website shortcuts ("ouvre YouTube") and search URLs.

export interface Site {
  label: string;
  url: string;
  aliases: string[];
}

export const SITES: Site[] = [
  { label: "YouTube", url: "https://www.youtube.com", aliases: ["youtube", "you tube", "youtub"] },
  { label: "YouTube Music", url: "https://music.youtube.com", aliases: ["youtube music"] },
  { label: "Google", url: "https://www.google.com", aliases: ["google"] },
  { label: "Gmail", url: "https://mail.google.com", aliases: ["gmail", "mes mails", "mes emails", "mes e mails", "ma boite mail", "boite mail", "mail", "mails"] },
  { label: "Outlook", url: "https://outlook.live.com", aliases: ["outlook", "hotmail"] },
  { label: "Netflix", url: "https://www.netflix.com", aliases: ["netflix"] },
  { label: "Spotify", url: "https://open.spotify.com", aliases: ["spotify"] },
  { label: "Deezer", url: "https://www.deezer.com", aliases: ["deezer"] },
  { label: "Facebook", url: "https://www.facebook.com", aliases: ["facebook", "fb"] },
  { label: "Instagram", url: "https://www.instagram.com", aliases: ["instagram", "insta"] },
  { label: "X (Twitter)", url: "https://x.com", aliases: ["twitter", "x"] },
  { label: "TikTok", url: "https://www.tiktok.com", aliases: ["tiktok", "tik tok"] },
  { label: "Twitch", url: "https://www.twitch.tv", aliases: ["twitch"] },
  { label: "Amazon", url: "https://www.amazon.fr", aliases: ["amazon"] },
  { label: "Leboncoin", url: "https://www.leboncoin.fr", aliases: ["leboncoin", "le bon coin", "bon coin"] },
  { label: "Wikipédia", url: "https://fr.wikipedia.org", aliases: ["wikipedia", "wiki"] },
  { label: "GitHub", url: "https://github.com", aliases: ["github", "git hub"] },
  { label: "ChatGPT", url: "https://chatgpt.com", aliases: ["chatgpt", "chat gpt"] },
  { label: "Claude", url: "https://claude.ai", aliases: ["claude"] },
  { label: "LinkedIn", url: "https://www.linkedin.com", aliases: ["linkedin", "linked in"] },
  { label: "Reddit", url: "https://www.reddit.com", aliases: ["reddit"] },
  { label: "WhatsApp Web", url: "https://web.whatsapp.com", aliases: ["whatsapp", "whats app"] },
  { label: "Discord", url: "https://discord.com/app", aliases: ["discord"] },
  { label: "Google Maps", url: "https://www.google.com/maps", aliases: ["google maps", "maps", "la carte", "carte", "plan", "gps"] },
  { label: "Google Drive", url: "https://drive.google.com", aliases: ["google drive", "drive"] },
  { label: "Google Agenda", url: "https://calendar.google.com", aliases: ["google agenda", "agenda", "calendrier", "google calendar"] },
  { label: "Google Traduction", url: "https://translate.google.com", aliases: ["google traduction", "google translate", "traducteur", "traduction"] },
  { label: "Disney+", url: "https://www.disneyplus.com", aliases: ["disney+", "disney plus", "disney"] },
  { label: "Prime Video", url: "https://www.primevideo.com", aliases: ["prime video", "amazon prime"] },
  { label: "Canal+", url: "https://www.canalplus.com", aliases: ["canal+", "canal plus"] },
  { label: "Le Monde", url: "https://www.lemonde.fr", aliases: ["le monde"] },
  { label: "France Info", url: "https://www.francetvinfo.fr", aliases: ["france info", "franceinfo"] },
  { label: "L'Équipe", url: "https://www.lequipe.fr", aliases: ["l equipe", "lequipe"] },
  { label: "Pinterest", url: "https://www.pinterest.fr", aliases: ["pinterest"] },
  { label: "Snapchat", url: "https://web.snapchat.com", aliases: ["snapchat", "snap"] },
  { label: "Doctolib", url: "https://www.doctolib.fr", aliases: ["doctolib"] },
  { label: "Ameli", url: "https://www.ameli.fr", aliases: ["ameli"] },
  { label: "Impots.gouv", url: "https://www.impots.gouv.fr", aliases: ["impots", "impot", "impots gouv"] },
  { label: "SNCF Connect", url: "https://www.sncf-connect.com", aliases: ["sncf", "sncf connect", "train"] },
  { label: "Airbnb", url: "https://www.airbnb.fr", aliases: ["airbnb"] },
  { label: "Booking", url: "https://www.booking.com", aliases: ["booking"] },
  { label: "Steam", url: "https://store.steampowered.com", aliases: ["steam", "store steam"] },
  { label: "Microsoft 365", url: "https://www.office.com", aliases: ["office", "office 365", "microsoft 365"] },
  { label: "Teams", url: "https://teams.microsoft.com", aliases: ["teams", "microsoft teams"] },
  { label: "Zoom", url: "https://zoom.us", aliases: ["zoom"] },
  { label: "Waze", url: "https://www.waze.com/live-map", aliases: ["waze"] },
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findSite(folded: string): Site | null {
  let best: Site | null = null;
  let bestLen = 0;
  const target = folded.trim();
  for (const s of SITES) {
    for (const a of s.aliases) {
      if (a.length <= bestLen) continue;
      if (a.length <= 2 && target !== a) continue;
      const re = new RegExp(`(^|\\s)${escapeRe(a)}(\\s|$)`);
      if (re.test(target)) {
        best = s;
        bestLen = a.length;
      }
    }
  }
  return best;
}

export const SEARCH = {
  google: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  youtube: (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  spotify: (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
  deezer: (q: string) => `https://www.deezer.com/search/${encodeURIComponent(q)}`,
  soundcloud: (q: string) => `https://soundcloud.com/search?q=${encodeURIComponent(q)}`,
  amazon: (q: string) => `https://www.amazon.fr/s?k=${encodeURIComponent(q)}`,
  maps: (q: string) => `https://www.google.com/maps/search/${encodeURIComponent(q)}`,
  leboncoin: (q: string) => `https://www.leboncoin.fr/recherche?text=${encodeURIComponent(q)}`,
  wikipedia: (q: string) => `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`,
  translate: (q: string, tl: string) => `https://translate.google.com/?sl=auto&tl=${tl}&text=${encodeURIComponent(q)}&op=translate`,
};
