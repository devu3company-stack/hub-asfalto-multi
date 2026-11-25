import { requireModule } from "@/lib/auth";
import { asc, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { MODULES, PERMISSIONS, ROLE_LABELS, type Role } from "@/lib/permissions";
import { PageHeader, Badge } from "@/components/ui";
import NewUserForm from "./NewUserForm";
import { atualizarUsuario, redefinirSenha } from "./actions";

export const dynamic = "force-dynamic";

const roles = (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
const ACCESS = { edit: "Editar", view: "Ver", none: "—" } as const;

export default async function Usuarios() {
  const me = await requireModule("usuarios", "edit");
  const [users, logs] = await Promise.all([
    db.query.users.findMany({ orderBy: asc(schema.users.createdAt) }),
    db.query.auditLogs.findMany({ limit: 20, orderBy: desc(schema.auditLogs.createdAt), with: { user: { columns: { name: true } } } }),
  ]);

  return (
    <>
      <PageHeader title="Usuários e permissões" subtitle="Cada pessoa entra com login próprio e só vê os módulos do seu perfil." />

      <section className="card flex flex-col gap-4">
        <h2 className="font-display font-bold text-lg">Novo usuário</h2>
        <NewUserForm roles={roles} />
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg">Equipe</h2>
        <ul className="flex flex-col divide-y divide-[#F1EFEE]">
          {users.map((u) => (
            <li key={u.id} className="py-3 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{u.name} {u.id === me.id && <span className="text-graphite-muted font-normal">(você)</span>}</p>
                <p className="text-xs text-graphite-muted break-all">{u.email}</p>
              </div>
              <form action={atualizarUsuario} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={u.id} />
                <label className="sr-only" htmlFor={`role-${u.id}`}>Perfil de {u.name}</label>
                <select id={`role-${u.id}`} name="role" defaultValue={u.role} className="input h-10 w-auto" disabled={u.id === me.id}>
                  {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm min-h-[44px] px-1">
                  <input type="checkbox" name="active" defaultChecked={u.active} disabled={u.id === me.id} className="w-4 h-4 accent-[#C25A14]" /> Ativo
                </label>
                {u.id !== me.id && <button className="btn-outline h-10">Salvar</button>}
              </form>
              <form action={redefinirSenha} className="flex items-center gap-2">
                <input type="hidden" name="id" value={u.id} />
                <label className="sr-only" htmlFor={`pw-${u.id}`}>Nova senha de {u.name}</label>
                <input id={`pw-${u.id}`} name="password" type="password" minLength={8} placeholder="Nova senha" autoComplete="new-password" className="input h-10 w-40" />
                <button className="btn-outline h-10">Trocar</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg">O que cada perfil acessa</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-graphite-muted">
                <th className="py-2 px-2 border-b border-surface-line">Perfil</th>
                {MODULES.map((m) => <th key={m.key} className="py-2 px-2 border-b border-surface-line">{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.value} className="border-b border-[#F1EFEE] last:border-0">
                  <td className="py-3 px-2 font-semibold">{r.label}</td>
                  {MODULES.map((m) => {
                    const a = PERMISSIONS[r.value as Role][m.key];
                    return <td key={m.key} className="py-3 px-2">{a === "none" ? <span className="text-graphite-muted">—</span> : <Badge tone={a === "edit" ? "orange" : "gray"}>{ACCESS[a]}</Badge>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg">Últimas ações</h2>
        <ul className="text-sm flex flex-col gap-2">
          {logs.length === 0 && <li className="text-graphite-muted">Nenhuma ação registrada ainda.</li>}
          {logs.map((l) => (
            <li key={l.id} className="flex flex-wrap gap-x-2">
              <span className="text-graphite-muted">{l.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
              <span className="font-medium">{l.user?.name ?? "Sistema"}</span>
              <span>{l.action}</span>
              {l.details && <span className="text-graphite-muted break-all">{l.details}</span>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
