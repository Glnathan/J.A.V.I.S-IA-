import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, hostnameOf, isLanHost, isLocalHost, isTailscaleHost, readRemoteConfig, verifySession } from "@/lib/remote-config";

/**
 * PC version only. The local server can control the computer (apps, Python plugins, Home Assistant), so:
 *  - requests from the PC itself (127.0.0.1) are trusted, but cross-site requests are rejected;
 *  - requests from elsewhere (phone via Tailscale or Wi-Fi) need remote access enabled + a PIN session.
 */
const PUBLIC = [
  /^\/_next\//,
  /^\/icons\//,
  /^\/sw\.js$/,
  /^\/manifest\.webmanifest$/,
  /^\/favicon/,
  /^\/icon\.png$/,
  /^\/apple-icon\.png$/,
  /^\/acces(\/|$)/,
  /^\/api\/remote\/login$/,
  /^\/api\/health$/,
];

function forbidden(text: string) {
  return new NextResponse(text, { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export function proxy(request: NextRequest) {
  const desktop = process.env.JARVIS_DESKTOP === "1" || process.env.JARVIS_DESKTOP_BUILD === "1";
  if (!desktop) return NextResponse.next();

  const hostHeader = (request.headers.get("host") ?? "").toLowerCase();
  const hostname = hostnameOf(hostHeader);
  // Next.js fills x-forwarded-for with the socket address and x-forwarded-host with the Host header;
  // Tailscale serve / other proxies put the real client there instead.
  const xff = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().replace(/^::ffff:/, "");
  const xfh = hostnameOf(request.headers.get("x-forwarded-host") ?? hostHeader);
  const remoteClient = (xff !== "" && !isLocalHost(xff)) || !isLocalHost(xfh) || request.headers.has("tailscale-user-login");
  const local = isLocalHost(hostname) && !remoteClient;

  // Cross-site protection (local and remote)
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const site = request.headers.get("sec-fetch-site");
    if (site === "cross-site") return forbidden("Requête refusée");
    const origin = request.headers.get("origin");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host.toLowerCase();
      } catch {
        originHost = "";
      }
      if (originHost !== hostHeader) return forbidden("Origine refusée");
    }
  }
  if (local) return NextResponse.next();

  // Tailscale serve keeps the .ts.net host in X-Forwarded-Host; honour it when the Host header is local.
  const effectiveHost = isLocalHost(hostname) && !isLocalHost(xfh) ? xfh : hostname;
  const cfg = readRemoteConfig();
  if (cfg.mode === "off") return forbidden("Accès distant désactivé. Activez-le dans J.A.R.V.I.S. → Paramètres → Mobile.");
  const hostOk = isTailscaleHost(effectiveHost) || (cfg.mode === "lan" && isLanHost(effectiveHost));
  if (!hostOk) return forbidden("Hôte non autorisé");

  const authed = verifySession(request.cookies.get(COOKIE)?.value, cfg);
  const headers = new Headers(request.headers);
  headers.set("x-jarvis-remote", authed ? "auth" : "anon");
  const pathname = request.nextUrl.pathname;
  if (authed || PUBLIC.some((re) => re.test(pathname))) return NextResponse.next({ request: { headers } });

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: cfg.pinHash ? "Code PIN requis" : "Définissez un code PIN dans J.A.R.V.I.S. → Paramètres → Mobile." }, { status: 401 });
  }
  // Real redirect (a rewrite would be proxied internally and fail behind HTTPS front-ends).
  const proto = request.headers.get("x-forwarded-proto") === "https" || isTailscaleHost(effectiveHost) ? "https" : "http";
  const target = `${proto}://${isLocalHost(hostname) ? xfh : hostHeader}/acces${cfg.pinHash ? "" : "?raison=pin"}`;
  return NextResponse.redirect(target, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
