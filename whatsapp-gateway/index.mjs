// Conexões de WhatsApp do Hub Asfalto Multi (Baileys / QR code) — uma sessão por usuário.
// Só fica acessível na rede interna do Docker. Toda chamada exige o token compartilhado com o hub.
//
// Rotas (sessão = id da conexão no hub):
//   GET  /s/:id/status     estado + QR
//   POST /s/:id/start      liga (gera QR se ainda não estiver pareada)
//   POST /s/:id/send       envia mensagem
//   POST /s/:id/check      confere se o número tem WhatsApp
//   POST /s/:id/logout     desconecta e apaga a sessão
// Rotas antigas (/status, /send, /check, /logout) usam a sessão "principal".
import http from "node:http";
import { access, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import pino from "pino";
import QRCode from "qrcode";
import makeWASocket, { Browsers, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion, useMultiFileAuthState } from "@whiskeysockets/baileys";

process.on("unhandledRejection", (e) => console.error("erro não tratado:", e?.message ?? e));

const PORT = Number(process.env.PORT ?? 3100);
const TOKEN = process.env.WA_GATEWAY_TOKEN ?? "";
const HUB_WEBHOOK = process.env.HUB_WEBHOOK_URL ?? "";
const AUTH_DIR = process.env.AUTH_DIR ?? "/data/auth"; // sessão "principal" (a que já existia)
const SESSOES_DIR = process.env.SESSOES_DIR ?? "/data/sessoes";
const MAX_MIDIA = 16 * 1024 * 1024;
const MAX_SESSOES = Number(process.env.MAX_SESSOES ?? 15);

if (TOKEN.length < 24) {
  console.error("WA_GATEWAY_TOKEN ausente ou curto (mínimo 24 caracteres).");
  process.exit(1);
}

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });
const idValido = (id) => /^[a-z0-9_-]{1,40}$/i.test(id);
const pastaDe = (id) => (id === "principal" ? AUTH_DIR : join(SESSOES_DIR, id));

/** Apaga só o conteúdo (a pasta pode ser ponto de montagem do volume). */
async function limpar(dir) {
  await mkdir(dir, { recursive: true });
  for (const f of await readdir(dir)) await rm(join(dir, f), { recursive: true, force: true });
}
const pareada = (dir) => access(join(dir, "creds.json")).then(() => true, () => false);

/** @type {Map<string, {id:string, dir:string, state:any, sock:any, starting:boolean, retries:number, parar:boolean, qrs:number, contatos:Map<string, any>, lids:Map<string,string>}>} */
const sessoes = new Map();

function sessao(id) {
  let s = sessoes.get(id);
  if (!s) {
    s = { id, dir: pastaDe(id), state: { status: "desconectado", qr: null, number: null, name: null, updatedAt: Date.now() }, sock: null, starting: false, retries: 0, parar: false, qrs: 0, contatos: new Map(), lids: new Map() };
    sessoes.set(id, s);
  }
  return s;
}
const set = (s, patch) => { s.state = { ...s.state, ...patch, updatedAt: Date.now() }; };

async function start(s) {
  if (s.starting || s.sock) return;
  s.starting = true;
  s.parar = false;
  try {
    await mkdir(s.dir, { recursive: true });
    const { state: auth, saveCreds } = await useMultiFileAuthState(s.dir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    set(s, { status: "conectando", qr: null });
    const sock = makeWASocket({ auth, version, logger, printQRInTerminal: false, browser: Browsers.appropriate("Desktop"), markOnlineOnConnect: false, syncFullHistory: false });
    s.sock = sock;
    sock.ev.on("creds.update", saveCreds);

    // Agenda do celular + nome do perfil: para mostrar o nome de quem não está salvo e achar o número por trás do "@lid".
    const guardar = (c) => {
      if (!c?.id) return;
      const antes = s.contatos.get(c.id) ?? {};
      const novo = { ...antes };
      for (const k of ["name", "notify", "verifiedName", "lid"]) if (c[k]) novo[k] = c[k];
      s.contatos.set(c.id, novo);
      if (c.id.endsWith("@s.whatsapp.net") && c.lid) s.lids.set(c.lid, c.id);
    };
    sock.ev.on("contacts.upsert", (cs) => cs.forEach(guardar));
    sock.ev.on("contacts.update", (cs) => cs.forEach(guardar));
    sock.ev.on("messaging-history.set", ({ contacts }) => contacts?.forEach(guardar));

    sock.ev.on("connection.update", async (u) => {
      if (u.qr) {
        s.qrs += 1;
        set(s, { status: "aguardando_qr", qr: await QRCode.toDataURL(u.qr, { margin: 1, width: 320 }) });
      }
      if (u.connection === "open") {
        s.retries = 0; s.qrs = 0;
        const jid = sock.user?.id ?? "";
        set(s, { status: "conectado", qr: null, number: jid.split(":")[0].split("@")[0], name: sock.user?.name ?? null });
        console.log(`[${s.id}] conectado:`, s.state.number);
      }
      if (u.connection === "close") {
        const code = u.lastDisconnect?.error?.output?.statusCode;
        s.sock = null;
        s.starting = false;
        if (s.parar) return;
        if (code === DisconnectReason.loggedOut) {
          // Desconectado pelo celular: limpa e para (o usuário liga de novo pelo hub).
          await limpar(s.dir);
          set(s, { status: "desconectado", qr: null, number: null, name: null });
          return;
        }
        // QR não lido por muito tempo: para de gerar até pedirem de novo.
        if (!(await pareada(s.dir)) && s.qrs >= 5) {
          set(s, { status: "desconectado", qr: null });
          s.qrs = 0;
          return;
        }
        set(s, { status: "conectando", qr: null });
        s.retries += 1;
        setTimeout(() => start(s), Math.min(30000, 2000 * s.retries));
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify" || !HUB_WEBHOOK) return;
      for (const m of messages) {
        const jid = m.key.remoteJid ?? "";
        if (!jid || jid === "status@broadcast" || jid.endsWith("@g.us") || jid.endsWith("@newsletter")) continue;
        const msg = m.message?.ephemeralMessage?.message ?? m.message?.viewOnceMessageV2?.message ?? m.message ?? {};
        const img = msg.imageMessage, aud = msg.audioMessage, vid = msg.videoMessage, doc = msg.documentMessage ?? msg.documentWithCaptionMessage?.message?.documentMessage, stk = msg.stickerMessage;
        const midia = img ? ["imagem", img] : aud ? ["audio", aud] : vid ? ["video", vid] : doc ? ["documento", doc] : stk ? ["figurinha", stk] : null;
        const text = msg.conversation ?? msg.extendedTextMessage?.text ?? img?.caption ?? vid?.caption ?? doc?.caption ?? "";
        if (!text && !midia) continue;
        // WhatsApp esconde o número de alguns contatos (jid "@lid"): usa o número real quando ele vem junto ou já é conhecido.
        let pn = null;
        if (jid.endsWith("@lid")) {
          pn = m.key.senderPn || s.lids.get(jid) || null;
          if (m.key.senderPn) s.lids.set(jid, m.key.senderPn);
        }
        const chatJid = pn || jid;
        if (!m.key.fromMe && m.pushName) guardar({ id: chatJid, notify: m.pushName });
        const ag = s.contatos.get(chatJid) ?? s.contatos.get(jid) ?? {};
        // Nome: o salvo na agenda do celular; senão o nome do perfil do WhatsApp.
        const nome = m.key.fromMe ? (ag.name ?? null) : (ag.name || m.pushName || ag.notify || ag.verifiedName || null);
        const payload = { session: s.id, id: m.key.id, chat: chatJid, lid: jid.endsWith("@lid") ? jid : null, fromMe: Boolean(m.key.fromMe), name: nome, text, timestamp: Number(m.messageTimestamp ?? Date.now() / 1000) };
        if (midia) {
          const [tipo, info] = midia;
          payload.media = { tipo, mimetype: info.mimetype ?? "application/octet-stream", fileName: info.fileName ?? null, voz: Boolean(info.ptt) };
          if (Number(info.fileLength ?? 0) <= MAX_MIDIA) {
            try {
              const buf = await downloadMediaMessage({ ...m, message: msg }, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage });
              payload.media.base64 = buf.toString("base64");
            } catch (e) { logger.warn({ err: e.message }, "falha ao baixar mídia"); }
          }
        }
        fetch(HUB_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json", "x-gateway-token": TOKEN }, body: JSON.stringify(payload) })
          .catch((e) => logger.warn({ err: e.message }, "falha ao avisar o hub"));
      }
    });
  } catch (e) {
    console.error(`[${s.id}] erro ao iniciar:`, e?.message ?? e);
    s.sock = null;
    set(s, { status: "desconectado", qr: null });
  } finally {
    s.starting = false;
  }
}

async function logout(s) {
  s.parar = true;
  try { await s.sock?.logout(); } catch { /* já desconectado */ }
  try { s.sock?.end?.(undefined); } catch { /* ok */ }
  s.sock = null;
  await limpar(s.dir);
  set(s, { status: "desconectado", qr: null, number: null, name: null });
}

const toJid = (n) => `${String(n).replace(/\D/g, "")}@s.whatsapp.net`;

function authorized(req) {
  const got = Buffer.from(String(req.headers["x-gateway-token"] ?? ""));
  const want = Buffer.from(TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
}
async function body(req) {
  let raw = "";
  for await (const c of req) {
    raw += c;
    if (raw.length > 30 * 1024 * 1024) throw new Error("arquivo grande demais (máx. 16 MB)");
  }
  return raw ? JSON.parse(raw) : {};
}
function send(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function conteudo({ text, media }) {
  const caption = text ? String(text).slice(0, 1024) : undefined;
  if (!media?.base64) return { text: String(text).slice(0, 4096) };
  const buf = Buffer.from(media.base64, "base64");
  const mimetype = media.mimetype || "application/octet-stream";
  return media.tipo === "imagem" ? { image: buf, caption, mimetype }
    : media.tipo === "video" ? { video: buf, caption, mimetype }
    : media.tipo === "audio" ? { audio: buf, mimetype, ptt: Boolean(media.voz) }
    : media.tipo === "figurinha" ? { sticker: buf }
    : { document: buf, mimetype, fileName: media.fileName || "arquivo", caption };
}

http.createServer(async (req, res) => {
  try {
    if (req.url === "/health") return send(res, 200, { ok: true, sessoes: sessoes.size });
    if (!authorized(req)) return send(res, 401, { error: "não autorizado" });

    let id = "principal", acao = (req.url ?? "").replace(/^\//, "");
    const m = (req.url ?? "").match(/^\/s\/([^/]+)\/(\w+)$/);
    if (m) { id = decodeURIComponent(m[1]); acao = m[2]; }
    if (!idValido(id)) return send(res, 400, { error: "sessão inválida" });

    if (req.method === "GET" && acao === "sessoes") return send(res, 200, [...sessoes.values()].map((s) => ({ id: s.id, ...s.state, qr: undefined })));

    if (req.method === "GET" && acao === "status") {
      const s = sessoes.get(id);
      return send(res, 200, s ? s.state : { status: "desconectado", qr: null, number: null, name: null });
    }
    if (req.method === "POST" && acao === "start") {
      if (!sessoes.has(id) && sessoes.size >= MAX_SESSOES) return send(res, 429, { error: `limite de ${MAX_SESSOES} conexões` });
      const s = sessao(id);
      if (!s.sock && !s.starting) { s.qrs = 0; start(s); }
      return send(res, 200, s.state);
    }
    if (req.method === "POST" && acao === "logout") {
      const s = sessoes.get(id) ?? sessao(id);
      await logout(s);
      if (id !== "principal") sessoes.delete(id);
      return send(res, 200, { ok: true });
    }

    const s = sessoes.get(id);
    if (!s || s.state.status !== "conectado" || !s.sock) return send(res, 409, { error: "Este WhatsApp não está conectado" });
    if (req.method === "POST" && acao === "send") {
      const b = await body(req);
      if (!b.to || (!b.text && !b.media?.base64)) return send(res, 400, { error: "informe to e text ou media" });
      const jid = String(b.to).includes("@") ? String(b.to) : toJid(b.to);
      const r = await s.sock.sendMessage(jid, conteudo(b));
      return send(res, 200, { ok: true, id: r?.key?.id, chat: jid });
    }
    if (req.method === "POST" && acao === "contato") {
      const { jid } = await body(req);
      const pnJ = String(jid).endsWith("@lid") ? s.lids.get(String(jid)) ?? null : null;
      const ag = s.contatos.get(pnJ ?? String(jid)) ?? s.contatos.get(String(jid)) ?? {};
      return send(res, 200, { pn: pnJ, name: ag.name || ag.notify || ag.verifiedName || null });
    }
    if (req.method === "POST" && acao === "check") {
      const { number } = await body(req);
      const [r] = await s.sock.onWhatsApp(toJid(number));
      return send(res, 200, { exists: Boolean(r?.exists), jid: r?.jid ?? null });
    }
    return send(res, 404, { error: "não encontrado" });
  } catch (e) {
    return send(res, 500, { error: e?.message ?? "erro" });
  }
}).listen(PORT, async () => {
  console.log(`Conexões WhatsApp ouvindo na porta ${PORT}`);
  // Religa as sessões já pareadas.
  if (await pareada(AUTH_DIR)) start(sessao("principal"));
  await mkdir(SESSOES_DIR, { recursive: true });
  for (const d of await readdir(SESSOES_DIR)) if (idValido(d) && (await pareada(join(SESSOES_DIR, d)))) start(sessao(d));
});
