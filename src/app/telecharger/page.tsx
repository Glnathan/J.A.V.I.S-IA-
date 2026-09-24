import type { Metadata } from "next";
import TelechargerView from "@/components/jarvis/TelechargerView";

export const metadata: Metadata = {
  title: "Télécharger J.A.R.V.I.S. pour Windows (option B)",
  description: "Téléchargez l'installateur Windows de J.A.R.V.I.S. et son code source.",
};

export const dynamic = "force-dynamic";

export default function TelechargerPage() {
  return <TelechargerView />;
}
