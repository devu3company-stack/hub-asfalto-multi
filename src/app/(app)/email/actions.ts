"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { AUTOMACOES, type AutomacaoChave, type AutomacaoConfig, type Passo } from "@/lib/email/modelos";
import type { EmailConteudo } from "@/lib/email/template";
import { cancelarFila, enviarTeste } from "@/lib/email/envio";
import { lojaValida } from "@/lib/lojas";
import { dispararCampanha, lerAutomacao, salvarAutomacao } from "@/lib/email/automacoes";
import {
  contarSegmento, emailValido, extrairDoWhatsApp, importarContatos, salvarContato, sincronizarOmieClientes, sincronizarShopify,
  type Origem, type Segmento,
} from "@/lib/email/contatos";

export type Msg = { ok: boolean; message: string } | undefined;

const editar = () => requireModule("email", "edit");
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function conteudoDo(f: FormData, p = ""): EmailConteudo {
  return {
    preheader: txt(f, `${p}preheader`), titulo: txt(f, `${p}titulo`), texto: String(f.get(`${p}texto`) ?? "").replace(/\r/g, "").trim(),
    imagemUrl: txt(f, `${p}imagemUrl`) || undefined, botaoTexto: txt(f, `${p}botaoTexto`) || undefined, botaoUrl: txt(f, `${p}botaoUrl`) || undefined,
  };
}
const urlOk = (u?: string) => !u || /^https:\/\//.test(u) || /^\{\{\s*\w+\s*\}\}$/.test(u);
function validarConteudo(c: EmailConteudo, assunto: string) {
  if (!assunto) return "Informe o assunto.";
  if (!c.titulo || !c.texto) return "Informe o título e o texto do e-mail.";
  if (!urlOk(c.botaoUrl) || !urlOk(c.imagemUrl)) return "Links e imagens precisam começar com https://";
  if (Boolean(c.botaoTexto) !== Boolean(c.botaoUrl)) return "Preencha o texto e o link do botão (ou deixe os dois em branco).";
  return null;
}

function segmentoDo(f: FormData): Segmento {
  const dias = (k: string) => { const n = Number(txt(f, k)); return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined; };
  return {
    origens: f.getAll("origens").map(String).filter(Boolean) as Origem[],
    tags: txt(f, "tags").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    compras: (txt(f, "compras") || "todos") as Segmento["compras"],
    semCompraDias: dias("semCompraDias"), compraUltimosDias: dias("compraUltimosDias"),
    uf: txt(f, "uf").toUpperCase().slice(0, 2) || undefined,
  };
}

/* -------------------------------- Campanhas -------------------------------- */

export async function salvarCampanha(_p: Msg, f: FormData): Promise<Msg> {
  const u = await editar();
  const id = txt(f, "id");
  const acao = txt(f, "acao"); // salvar | teste | agendar | enviar
  const assunto = txt(f, "assunto");
  const conteudo = conteudoDo(f);
  const segmento = segmentoDo(f);
  const nome = txt(f, "nome") || assunto || "Campanha";
  const loja = lojaValida(txt(f, "loja"));
  const erro = validarConteudo(conteudo, assunto);
  if (erro) return { ok: false, message: erro };

  if (id) {
    const atual = await db.query.emailCampanhas.findFirst({ where: eq(schema.emailCampanhas.id, id) });
    if (!atual) return { ok: false, message: "Campanha não encontrada." };
    if (!["rascunho", "agendada"].includes(atual.status)) return { ok: false, message: "Esta campanha já foi enviada e não pode ser alterada." };
  }
  const dados = { nome, assunto, conteudo, segmento, loja, contaId: txt(f, "contaId") || null };
  let cid = id;
  if (cid) await db.update(schema.emailCampanhas).set(dados).where(eq(schema.emailCampanhas.id, cid));
  else cid = (await db.insert(schema.emailCampanhas).values({ ...dados, userId: u.id }).returning({ id: schema.emailCampanhas.id }))[0].id;

  if (acao === "teste") {
    const para = txt(f, "emailTeste").toLowerCase();
    if (!emailValido(para)) return { ok: false, message: "Informe um e-mail válido para o teste." };
    try { await enviarTeste(loja, para, assunto, conteudo, dados.contaId); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Falha no teste." }; }
    revalidatePath("/email");
    if (!id) redirect(`/email/campanhas/${cid}?teste=1`);
    return { ok: true, message: `Teste enviado para ${para}.` };
  }
  if (acao === "agendar" || acao === "enviar") {
    const n = await contarSegmento({ ...segmento, loja });
    if (!n) return { ok: false, message: "Nenhum contato neste público." };
    if (acao === "agendar") {
      const tz = Number(txt(f, "tz")) || 180; // minutos (Brasília = 180)
      const quando = new Date(Date.parse(`${txt(f, "agendadaPara")}:00Z`) + tz * 60_000);
      if (Number.isNaN(quando.getTime()) || quando.getTime() < Date.now() + 60_000) return { ok: false, message: "Escolha uma data e hora no futuro." };
      await db.update(schema.emailCampanhas).set({ status: "agendada", agendadaPara: quando }).where(eq(schema.emailCampanhas.id, cid));
      await audit(u.id, "email.campanha_agendar", `${nome} · ${n} contatos`);
    } else {
      await dispararCampanha(cid);
      await audit(u.id, "email.campanha_enviar", `${nome} · ${n} contatos`);
    }
    revalidatePath("/email");
    redirect(`/email/campanhas/${cid}`);
  }
  await audit(u.id, "email.campanha_salvar", nome);
  revalidatePath("/email");
  if (!id) redirect(`/email/campanhas/${cid}`);
  return { ok: true, message: "Rascunho salvo." };
}

export async function cancelarCampanha(f: FormData) {
  const u = await editar();
  const id = txt(f, "id");
  await db.update(schema.emailCampanhas).set({ status: "cancelada" }).where(eq(schema.emailCampanhas.id, id));
  await cancelarFila({ campanhaId: id });
  await audit(u.id, "email.campanha_cancelar", id);
  revalidatePath("/email");
}

export async function excluirCampanha(f: FormData) {
  const u = await editar();
  const id = txt(f, "id");
  const c = await db.query.emailCampanhas.findFirst({ where: eq(schema.emailCampanhas.id, id) });
  if (c && (c.status === "rascunho" || c.status === "cancelada")) {
    await db.delete(schema.emailCampanhas).where(eq(schema.emailCampanhas.id, id));
    await audit(u.id, "email.campanha_excluir", c.nome);
  }
  revalidatePath("/email");
  redirect("/email");
}

export async function contarPublico(f: FormData) {
  await requireModule("email");
  return contarSegmento({ ...segmentoDo(f), loja: lojaValida(txt(f, "loja")) });
}

/* -------------------------------- Automações -------------------------------- */

export async function salvarAutomacaoForm(_p: Msg, f: FormData): Promise<Msg> {
  const u = await editar();
  const chave = txt(f, "chave") as AutomacaoChave;
  const loja = lojaValida(txt(f, "loja"));
  if (!(chave in AUTOMACOES)) return { ok: false, message: "Automação inválida." };
  const n = Number(txt(f, "passos")) || 0;
  const passos: Passo[] = [];
  for (let i = 0; i < n; i++) {
    const assunto = txt(f, `p${i}_assunto`);
    const conteudo = conteudoDo(f, `p${i}_`);
    const erro = validarConteudo(conteudo, assunto);
    if (erro) return { ok: false, message: `E-mail ${i + 1}: ${erro}` };
    const esperaHoras = Number(txt(f, `p${i}_espera`)) * (txt(f, `p${i}_unidade`) === "dias" ? 24 : 1);
    if (!Number.isFinite(esperaHoras) || esperaHoras < 0) return { ok: false, message: `E-mail ${i + 1}: prazo inválido.` };
    passos.push({ esperaHoras, assunto, conteudo });
  }
  const config: AutomacaoConfig = { passos, contaId: txt(f, "contaId") || undefined };
  if (chave === "reativacao") {
    config.diasSemCompra = Math.max(15, Number(txt(f, "diasSemCompra")) || 120);
    config.intervaloDias = Math.max(15, Number(txt(f, "intervaloDias")) || 90);
  }
  const ativo = f.get("ativo") === "sim";
  await salvarAutomacao(chave, loja, ativo, config);
  if (!ativo) await cancelarFila({ automacaoPrefixo: chave, loja });
  await audit(u.id, "email.automacao_salvar", `${chave} ${ativo ? "ligada" : "desligada"}`);
  revalidatePath("/email/automacoes");
  return { ok: true, message: ativo ? "Automação salva e ligada." : "Automação salva (desligada)." };
}

export async function testarPasso(_p: Msg, f: FormData): Promise<Msg> {
  await editar();
  const chave = txt(f, "chave") as AutomacaoChave;
  const i = Number(txt(f, "passo"));
  const para = txt(f, "emailTeste").toLowerCase();
  if (!emailValido(para)) return { ok: false, message: "Informe um e-mail válido." };
  const loja = lojaValida(txt(f, "loja"));
  const { config } = await lerAutomacao(chave, loja);
  const p = config.passos[i];
  if (!p) return { ok: false, message: "Salve a automação antes de testar." };
  try { await enviarTeste(loja, para, p.assunto, p.conteudo, config.contaId); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Falha." }; }
  return { ok: true, message: `Teste enviado para ${para}.` };
}

/* --------------------------------- Contatos --------------------------------- */

export async function sincronizar(_p: Msg, f: FormData): Promise<Msg> {
  const u = await editar();
  const fonte = txt(f, "fonte");
  const loja = lojaValida(txt(f, "loja"));
  try {
    let msg = "";
    if (fonte === "shopify") { const r = await sincronizarShopify(loja); msg = `Shopify: ${r.total} contatos, ${r.comPedidos} com histórico de compras.`; }
    else if (fonte === "omie") { const r = await sincronizarOmieClientes(loja); msg = `Omie: ${r.total} clientes com e-mail, ${r.comPedidos} com pedidos.`; }
    else if (fonte === "whatsapp") { const r = await extrairDoWhatsApp(loja); msg = `WhatsApp: ${r.total} e-mails encontrados nas conversas.`; }
    else return { ok: false, message: "Fonte inválida." };
    await audit(u.id, "email.sincronizar", msg);
    revalidatePath("/email/contatos");
    return { ok: true, message: msg };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao sincronizar." };
  }
}

export async function importar(_p: Msg, f: FormData): Promise<Msg> {
  const u = await editar();
  const arq = f.get("arquivo");
  if (!(arq instanceof File) || !arq.size) return { ok: false, message: "Escolha a planilha (.xlsx ou .csv)." };
  if (arq.size > 10_000_000) return { ok: false, message: "Planilha muito grande (máx. 10 MB)." };
  const origem = txt(f, "consentimento");
  if (!origem) return { ok: false, message: "Diga de onde vieram esses contatos (ex.: leads do RD Station que aceitaram receber e-mails)." };
  const tags = txt(f, "tags").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  try {
    const r = await importarContatos(arq, tags, origem, lojaValida(txt(f, "loja")));
    await audit(u.id, "email.importar", `${r.total} contatos`);
    revalidatePath("/email/contatos");
    return { ok: true, message: `${r.total} contato(s) importado(s)${r.invalidos ? `, ${r.invalidos} e-mail(s) inválido(s) ignorado(s)` : ""}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Não consegui ler a planilha." };
  }
}

export async function novoContato(_p: Msg, f: FormData): Promise<Msg> {
  const u = await editar();
  const c = await salvarContato({
    email: txt(f, "email"), nome: txt(f, "nome"), telefone: txt(f, "telefone").replace(/\D/g, ""), cidade: txt(f, "cidade"), uf: txt(f, "uf"),
    origem: "manual", loja: lojaValida(txt(f, "loja")), tags: txt(f, "tags").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean), consentimento: txt(f, "consentimento") || "Cadastro manual",
  });
  if (!c) return { ok: false, message: "E-mail inválido." };
  await audit(u.id, "email.contato_criar", c.email);
  revalidatePath("/email/contatos");
  return { ok: true, message: "Contato salvo." };
}

export async function alternarDescadastro(f: FormData) {
  const u = await editar();
  const id = txt(f, "id");
  const c = await db.query.contatos.findFirst({ where: eq(schema.contatos.id, id) });
  if (!c) return;
  // reativar só é permitido se a pessoa pediu (registrado na auditoria)
  await db.update(schema.contatos).set({ descadastradoEm: c.descadastradoEm ? null : new Date(), updatedAt: new Date() }).where(eq(schema.contatos.id, id));
  if (!c.descadastradoEm) await cancelarFila({ contatoId: id });
  await audit(u.id, c.descadastradoEm ? "email.contato_reativar" : "email.contato_descadastrar", c.email);
  revalidatePath("/email/contatos");
}

export async function excluirContato(f: FormData) {
  const u = await editar();
  const id = txt(f, "id");
  const c = await db.query.contatos.findFirst({ where: eq(schema.contatos.id, id) });
  if (c) {
    await db.delete(schema.contatos).where(eq(schema.contatos.id, id));
    await audit(u.id, "email.contato_excluir", c.email);
  }
  revalidatePath("/email/contatos");
}
