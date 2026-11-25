import { requireUser } from "@/lib/auth";
import { MODULES, ROLE_LABELS, can } from "@/lib/permissions";
import { SideNav, BottomNav } from "@/components/NavLinks";
import { Icon } from "@/components/Icons";
import { logout } from "../login/actions";

const MOBILE_KEYS = ["painel", "pedidos", "financeiro", "relatorios", "whatsapp", "manuais"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = MODULES.filter((m) => can(user.role, m.key)).map(({ key, label, href }) => ({ key, label, href }));
  const mobile = items.filter((m) => MOBILE_KEYS.includes(m.key)).slice(0, 5);

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden lg:flex w-[250px] shrink-0 bg-white border-r border-surface-line px-4 py-6 flex-col gap-1 sticky top-0 h-screen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Asfalto Multi" className="w-[150px] mx-2 mb-7" />
        <nav aria-label="Menu principal" className="flex flex-col gap-1">
          <SideNav items={items} />
        </nav>
        <div className="mt-auto border-t border-surface-line pt-4 px-2">
          <p className="text-sm font-semibold">{user.name}</p>
          <p className="text-xs text-graphite-muted mb-3">{ROLE_LABELS[user.role]}</p>
          <form action={logout}>
            <button className="flex items-center gap-2 text-sm text-graphite hover:text-brand-text"><Icon name="sair" size={18} />Sair</button>
          </form>
        </div>
      </aside>

      <header className="lg:hidden bg-white border-b border-surface-line px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Asfalto Multi" className="w-28" />
        <form action={logout}>
          <button aria-label="Sair" className="w-11 h-11 rounded-xl border border-[#DAD6D3] flex items-center justify-center text-graphite"><Icon name="sair" /></button>
        </form>
      </header>

      <main className="flex-1 min-w-0 px-4 py-5 lg:px-9 lg:py-7 pb-24 lg:pb-10 flex flex-col gap-6">{children}</main>
      <BottomNav items={mobile} />
    </div>
  );
}
