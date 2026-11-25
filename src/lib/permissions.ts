export type Role = "ADMIN" | "FINANCEIRO" | "COMERCIAL" | "ATENDIMENTO";
export type Access = "none" | "view" | "edit";

export const MODULES = [
  { key: "painel", label: "Painel", href: "/" },
  { key: "pedidos", label: "Pedidos", href: "/pedidos" },
  { key: "estoque", label: "Estoque", href: "/estoque" },
  { key: "relatorios", label: "Relatórios", href: "/relatorios" },
  { key: "financeiro", label: "Financeiro", href: "/financeiro" },
  { key: "fretes", label: "Fretes", href: "/fretes" },
  { key: "email", label: "E-mail marketing", href: "/email" },
  { key: "manuais", label: "Manuais", href: "/manuais" },
  { key: "whatsapp", label: "WhatsApp", href: "/whatsapp" },
  { key: "integracoes", label: "Integrações", href: "/integracoes" },
  { key: "usuarios", label: "Usuários", href: "/usuarios" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  FINANCEIRO: "Financeiro",
  COMERCIAL: "Comercial",
  ATENDIMENTO: "Atendimento",
};

/** Matriz de permissões por perfil. Ajuste aqui para mudar o que cada perfil vê. */
export const PERMISSIONS: Record<Role, Record<ModuleKey, Access>> = {
  ADMIN: {
    painel: "edit", pedidos: "edit", estoque: "edit", relatorios: "edit", financeiro: "edit", fretes: "edit", email: "edit",
    manuais: "edit", whatsapp: "edit", integracoes: "edit", usuarios: "edit",
  },
  FINANCEIRO: {
    painel: "view", pedidos: "view", estoque: "view", relatorios: "none", financeiro: "edit", fretes: "view", email: "none",
    manuais: "view", whatsapp: "none", integracoes: "none", usuarios: "none",
  },
  COMERCIAL: {
    painel: "view", pedidos: "edit", estoque: "edit", relatorios: "view", financeiro: "none", fretes: "edit", email: "edit",
    manuais: "view", whatsapp: "edit", integracoes: "none", usuarios: "none",
  },
  ATENDIMENTO: {
    painel: "none", pedidos: "view", estoque: "view", relatorios: "none", financeiro: "none", fretes: "edit", email: "none",
    manuais: "view", whatsapp: "edit", integracoes: "none", usuarios: "none",
  },
};

export function can(role: Role, module: ModuleKey, need: Exclude<Access, "none"> = "view") {
  const a = PERMISSIONS[role]?.[module] ?? "none";
  if (need === "view") return a === "view" || a === "edit";
  return a === "edit";
}

export function firstAllowedHref(role: Role) {
  return MODULES.find((m) => can(role, m.key))?.href ?? "/login";
}
