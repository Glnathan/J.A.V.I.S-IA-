import type { Metadata, Viewport } from "next";
import { Exo_2, Orbitron, Share_Tech_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron", display: "swap" });
const exo = Exo_2({ subsets: ["latin"], variable: "--font-exo", display: "swap" });
const mono = Share_Tech_Mono({ subsets: ["latin"], weight: "400", variable: "--font-mono-tech", display: "swap" });

export const metadata: Metadata = {
  title: "J.A.R.V.I.S. — Assistant IA personnel",
  description: "Just A Rather Very Intelligent System : votre assistant IA vocal, inspiré d'Iron Man.",
  applicationName: "J.A.R.V.I.S.",
  appleWebApp: { capable: true, title: "JARVIS", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#02060c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${orbitron.variable} ${exo.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
