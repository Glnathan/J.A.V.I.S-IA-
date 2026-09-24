import type { Metadata } from "next";
import PinGate from "@/components/jarvis/PinGate";

export const metadata: Metadata = { title: "J.A.R.V.I.S. — Accès distant" };
export const dynamic = "force-dynamic";

export default async function AccesPage({ searchParams }: { searchParams: Promise<{ raison?: string }> }) {
  const { raison } = await searchParams;
  return <PinGate noPin={raison === "pin"} />;
}
