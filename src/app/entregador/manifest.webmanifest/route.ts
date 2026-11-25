import { NextResponse } from "next/server";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({
    name: "Fretes Asfalto Multi",
    short_name: "Fretes AM",
    start_url: "/entregador",
    scope: "/entregador",
    display: "standalone",
    background_color: "#F4F3F2",
    theme_color: "#F07A1E",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json" } });
}
