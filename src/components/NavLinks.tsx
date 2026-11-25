"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icons";

type Item = { key: string; label: string; href: string };

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function SideNav({ items }: { items: Item[] }) {
  const path = usePathname();
  return (
    <>
      {items.map((m) => {
        const on = isActive(path, m.href);
        return (
          <Link
            key={m.key}
            href={m.href}
            aria-current={on ? "page" : undefined}
            className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-[15px] ${on ? "bg-brand-soft text-brand-text font-semibold" : "text-graphite hover:bg-surface"}`}
          >
            <Icon name={m.key} />
            {m.label}
          </Link>
        );
      })}
    </>
  );
}

/** Barra inferior do celular/PWA: até 5 itens. */
export function BottomNav({ items }: { items: Item[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Navegação" className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-surface-line grid pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
      {items.map((m) => {
        const on = isActive(path, m.href);
        return (
          <Link key={m.key} href={m.href} aria-current={on ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-1 min-h-[56px] text-[11px] ${on ? "text-brand-text font-semibold" : "text-graphite"}`}>
            <Icon name={m.key} size={22} />
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
