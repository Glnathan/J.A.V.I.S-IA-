import {
  agendaList,
  gmailAuthUrl,
  gmailBody,
  gmailConnected,
  gmailCredentials,
  gmailDisconnect,
  gmailList,
  credentialsPath,
  hasCalendarScope,
} from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "status";

  if (action === "status") {
    return Response.json({
      configured: Boolean(gmailCredentials()),
      connected: gmailConnected(),
      agenda: hasCalendarScope(),
      credentialsPath: credentialsPath(),
    });
  }
  if (action === "agenda") {
    try {
      const events = await agendaList(Number(url.searchParams.get("max")) || 8);
      return Response.json({ events });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Erreur Agenda" }, { status: 400 });
    }
  }
  if (action === "url") {
    const auth = gmailAuthUrl(Number(url.port) || 3777);
    if (!auth) return Response.json({ error: "credentials.json est introuvable. Suivez les étapes de l'onglet Mails." }, { status: 400 });
    return Response.json({ url: auth });
  }
  if (action === "list") {
    try {
      const max = Number(url.searchParams.get("max")) || 50;
      const messages = await gmailList(max, url.searchParams.get("q") ?? "");
      return Response.json({ messages });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Erreur Gmail" }, { status: 400 });
    }
  }
  if (action === "read") {
    try {
      const id = url.searchParams.get("id") ?? "";
      const body = await gmailBody(id);
      return Response.json({ body });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Erreur Gmail" }, { status: 400 });
    }
  }
  return Response.json({ error: "Action inconnue" }, { status: 400 });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "disconnect") {
    gmailDisconnect();
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Action inconnue" }, { status: 400 });
}
