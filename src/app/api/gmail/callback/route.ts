import { gmailExchangeCode } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const html = (title: string, text: string) =>
  `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title>` +
  `<style>body{background:#02060c;color:#dff7ff;font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0}` +
  `h1{color:#22d3ee;font-size:1.2rem;letter-spacing:.2em}</style></head>` +
  `<body><main style="text-align:center;max-width:32rem;padding:2rem"><h1>J.A.R.V.I.S.</h1><p>${text}</p></main></body></html>`;

/** Retour d'autorisation Google : échange le code contre un token enregistré dans le dossier de données. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return new Response(html("J.A.R.V.I.S.", "Aucun code d'autorisation reçu de Google."), { status: 400, headers: { "content-type": "text/html; charset=utf-8" } });
  try {
    await gmailExchangeCode(code, Number(url.port) || 3777);
    return new Response(
      html("J.A.R.V.I.S.", "Gmail est connecté. Vous pouvez fermer cet onglet et revenir dans J.A.R.V.I.S. — Paramètres → Mails."),
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  } catch (e) {
    return new Response(
      html("J.A.R.V.I.S.", `La connexion a échoué : ${e instanceof Error ? e.message : "erreur inconnue"}. Réessayez depuis Paramètres → Mails.`),
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}
