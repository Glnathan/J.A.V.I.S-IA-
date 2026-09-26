// Activation et renouvellement de la licence Premium auprès du service de licences.
// JARVIS sert d'intermédiaire : la clé du client ne part que vers le service de
// licences, et le jeton signé est conservé dans la base locale.
import { getSettings, updateSettings } from "@/lib/brain/settings";
import { buildSettingsPayload } from "@/lib/brain/payload";
import { activatePremiumKey, premiumExpiry, verifyPremiumToken } from "@/lib/premium";
import { touchActivity } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** État Premium : jeton courant, expiration, clé en attente. */
export async function GET() {
  const s = await getSettings();
  const token = verifyPremiumToken(s.premiumToken);
  return Response.json({
    premiumActive: Boolean(token),
    expires: premiumExpiry(s),
    keyStored: s.premiumKey.trim().length > 0,
  });
}

/** Active (ou renouvelle) une clé : le service délivre un jeton signé d'un an. */
export async function POST(req: Request) {
  touchActivity();
  const body = (await req.json().catch(() => ({}))) as { key?: unknown };
  const s = await getSettings();
  const key = typeof body.key === "string" && body.key.trim() ? body.key : s.premiumKey;
  if (!key || !key.trim()) return Response.json({ error: "Aucune clé à activer — collez votre clé dans le champ ci-contre." }, { status: 400 });
  const r = await activatePremiumKey(key);
  if (!r.ok || !r.token) return Response.json({ error: r.error ?? "Activation impossible." }, { status: 400 });
  await updateSettings({ premiumKey: key, premiumToken: r.token });
  return Response.json(await buildSettingsPayload());
}
