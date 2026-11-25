import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Fretes — Asfalto Multi",
  manifest: "/entregador/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Fretes AM", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#F07A1E" };

export default function LayoutEntregador({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-10 bg-white border-b border-surface-line px-4 h-14 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Asfalto Multi" className="h-8 w-auto" />
        <span className="font-display font-bold">Fretes</span>
      </header>
      <main className="max-w-xl mx-auto p-4 pb-16 flex flex-col gap-4">{children}</main>
    </div>
  );
}
