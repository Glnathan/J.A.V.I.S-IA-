import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "J.A.R.V.I.S. — Assistant IA",
    short_name: "JARVIS",
    description: "Votre assistant IA personnel et vocal, inspiré d'Iron Man.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#02060c",
    theme_color: "#02060c",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
