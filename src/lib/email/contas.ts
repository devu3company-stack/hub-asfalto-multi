import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { decrypt, encrypt } from "../crypto";
import type { Config } from "../integrations/store";

const T = schema.emailContas;
export type ContaEmail = typeof T.$inferSelect;

/** Campos de uma conta de envio (iguais ao SMTP de Integrações). */
export const CAMPOS_SMTP = [
  { key: "host", label: "Servidor SMTP", placeholder: "smtp.hostinger.com" },
  { key: "port", label: "Porta", placeholder: "465" },
  { key: "user", label: "Usuário (e-mail completo)", placeholder: "vendas@asfaltomulti.com.br" },
  { key: "pass", label: "Senha do e-mail", secret: true },
  { key: "fromName", label: "Nome do remetente", placeholder: "Rodrigo | Asfalto Multi", optional: true },
  { key: "fromEmail", label: "E-mail do remetente", placeholder: "Igual ao usuário", optional: true },
  { key: "replyTo", label: "Responder para", placeholder: "Igual ao remetente", optional: true },
  { key: "limitePorHora", label: "Limite por hora", placeholder: "80", optional: true },
  { key: "limitePorDia", label: "Limite por dia", placeholder: "800", optional: true },
] as const;

export async function listarContas(soAtivas = false) {
  const l = await db.select({ id: T.id, nome: T.nome, email: T.email, ativo: T.ativo, status: T.status, erro: T.erro }).from(T).orderBy(asc(T.nome));
  return soAtivas ? l.filter((c) => c.ativo) : l;
}

/** Configuração SMTP de uma conta (null se não existe ou está desligada). */
export async function smtpDaConta(id: string | null | undefined): Promise<Config | null> {
  if (!id) return null;
  const c = await db.query.emailContas.findFirst({ where: eq(T.id, id) });
  if (!c || !c.ativo) return null;
  try { return JSON.parse(decrypt(c.config)); } catch { return null; }
}

/** Cria ou atualiza; campos em branco mantêm o valor salvo (a senha nunca volta para a tela). */
export async function salvarConta(id: string | null, nome: string, incoming: Config) {
  const atual = id ? (await smtpDaConta(id)) ?? {} : {};
  const cfg: Config = { ...atual };
  for (const [k, v] of Object.entries(incoming)) if (v.trim()) cfg[k] = v.trim();
  if (!cfg.host || !cfg.user || !cfg.pass) throw new Error("Informe servidor, usuário e senha.");
  const dados = { nome: nome || cfg.user, email: cfg.fromEmail || cfg.user, config: encrypt(JSON.stringify(cfg)), status: "nao_testado", erro: null };
  if (id) { await db.update(T).set(dados).where(eq(T.id, id)); return id; }
  const [n] = await db.insert(T).values(dados).returning({ id: T.id });
  return n.id;
}

export async function marcarStatus(id: string, ok: boolean, erro?: string) {
  await db.update(T).set({ status: ok ? "ok" : "erro", erro: ok ? null : (erro ?? "Erro").slice(0, 300) }).where(eq(T.id, id));
}
