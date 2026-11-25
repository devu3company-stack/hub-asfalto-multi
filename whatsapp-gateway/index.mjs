// Conexão do WhatsApp do Hub Asfalto Multi (mesma tecnologia de conexão do ZapPro: Baileys / QR code).
// Só fica acessível na rede interna do Docker. Toda chamada exige o token compartilhado com o hub.
import http from "node:http";
import { rm, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Apaga só o conteúdo: /data/auth pode ser o ponto de montagem do volume (rmdir dá EBUSY).
async function limparAuth() {
  await mkdir(AUTH_DIR, { recursive: true });
  for (const f of await readdir(AUTH_DIR)) await rm(join(AUTH_DIR, f), { recursive: true, force: true });
}
process.on("unhandledRejection", (e) => console.error("erro não tratado:", e?.message ?? e));
import { timingSafeEqual } from "node:crypto";
import pino from "pino";
import QRCode from "qrcode";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";

const PORT = Number(process.env.PORT ?? 3100);
const TOKEN = process.env.WA_GATEWAY_TOKEN ?? "";
const HUB_WEBHOOK = process.env.HUB_WEBHOOK_URL ?? "";
const AUTH_DIR = process.env.AUTH_DIR ?? "/data/auth";
const MAX_MIDIA = 16 * 1024 * 1024;

if (TOKEN.length < 24) {
  console.error("WA_GATEWAY_TOKEN ausente ou curto (mínimo 24 caracteres).");
  process.exit(1);
}

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

/** estado: desconectado | aguardando_qr | conectando | conectado */
let state = { status: "desconectado", qr: null, number: null, name: null, updatedAt: Date.now() };
let sock = null;
let starting = false;
let retries = 0;

function set(patch) {
  state = { ...state, ...patch, updatedAt: Date.now() };
}

async function start() {
  if (starting) return;
  starting = true;
  try {
    const { state: auth, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    set({ status: "conectando", qr: null });

    sock = makeWASocket({
      auth,
      version,
      logger,
      printQRInTerminal: false,
      browser: Browsers.appropriate("Desktop"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (u) => {
      if (u.qr) {
        set({ status: "aguardando_qr", qr: await QRCode.toDataURL(u.qr, { margin: 1, width: 320 }) });
      }
      if (u.connection === "open") {
        retries = 0;
        const id = sock.user?.id ?? "";
        set({ status: "conectado", qr: null, number: id.split(":")[0].split("@")[0], name: sock.user?.name ?? null });
        console.log("WhatsApp conectado:", state.number);
      }
      if (u.connection === "close") {
        const code = u.lastDisconnect?.error?.output?.statusCode;
        sock = null;
        if (code === DisconnectReason.loggedOut) {
          // Sessão encerrada no celular: limpa e volta a mostrar QR.
          await limparAuth();
          set({ status: "desconectado", qr: null, number: null, name: null });
          starting = false;
          setTimeout(start, 1000);
          return;
        }
        set({ status: "conectando", qr: null });
        retries += 1;
        starting = false;
        setTimeout(start, Math.min(30000, 2000 * retries));
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
        const payload = {
          id: m.key.id,
          chat: jid,
          fromMe: Boolean(m.key.fromMe),
          name: m.pushName ?? null,
          text,
          timestamp: Number(m.messageTimestamp ?? Date.now() / 1000),
        };
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
        fetch(HUB_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-gateway-token": TOKEN },
          body: JSON.stringify(payload),
        }).catch((e) => logger.warn({ err: e.message }, "falha ao avisar o hub"));
      }
    });
  } catch (e) {
    console.error("Erro ao iniciar a conexão:", e?.message ?? e);
    set({ status: "desconectado", qr: null });
    setTimeout(start, 5000);
  } finally {
    starting = false;
  }
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

http
  .createServer(async (req, res) => {
    try {
      if (req.url === "/health") return send(res, 200, { ok: true });
      if (!authorized(req)) return send(res, 401, { error: "não autorizado" });

      if (req.method === "GET" && req.url === "/status") return send(res, 200, state);

      if (req.method === "POST" && req.url === "/send") {
        if (state.status !== "conectado" || !sock) return send(res, 409, { error: "WhatsApp não conectado" });
        const { to, text, media } = await body(req);
        if (!to || (!text && !media?.base64)) return send(res, 400, { error: "informe to e text ou media" });
        const jid = String(to).includes("@") ? String(to) : toJid(to);
        const caption = text ? String(text).slice(0, 1024) : undefined;
        let content;
        if (media?.base64) {
          const buf = Buffer.from(media.base64, "base64");
          const mimetype = media.mimetype || "application/octet-stream";
          content =
            media.tipo === "imagem" ? { image: buf, caption, mimetype } :
            media.tipo === "video" ? { video: buf, caption, mimetype } :
            media.tipo === "audio" ? { audio: buf, mimetype, ptt: Boolean(media.voz) } :
            media.tipo === "figurinha" ? { sticker: buf } :
            { document: buf, mimetype, fileName: media.fileName || "arquivo", caption };
        } else content = { text: String(text).slice(0, 4096) };
        const r = await sock.sendMessage(jid, content);
        return send(res, 200, { ok: true, id: r?.key?.id, chat: jid });
      }

      if (req.method === "POST" && req.url === "/check") {
        if (state.status !== "conectado" || !sock) return send(res, 409, { error: "WhatsApp não conectado" });
        const { number } = await body(req);
        const [r] = await sock.onWhatsApp(toJid(number));
        return send(res, 200, { exists: Boolean(r?.exists), jid: r?.jid ?? null });
      }

      if (req.method === "POST" && req.url === "/logout") {
        try { await sock?.logout(); } catch { /* já desconectado */ }
        sock = null;
        await limparAuth();
        set({ status: "desconectado", qr: null, number: null, name: null });
        setTimeout(start, 1000);
        return send(res, 200, { ok: true });
      }

      return send(res, 404, { error: "não encontrado" });
    } catch (e) {
      return send(res, 500, { error: e?.message ?? "erro" });
    }
  })
  .listen(PORT, () => {
    console.log(`Conexão WhatsApp ouvindo na porta ${PORT}`);
    start();
  });
