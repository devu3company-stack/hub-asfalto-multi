import "server-only";
import { execFile } from "child_process";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";
import { createId } from "@paralleldrive/cuid2";

const run = promisify(execFile);
export const MAX_MIDIA = 16 * 1024 * 1024; // limite do WhatsApp para vídeo/áudio/imagem
const dir = () => process.env.WA_MIDIA_DIR ?? path.join(path.dirname(process.env.MANUAIS_DIR ?? "/app/data/manuais"), "whatsapp");

export type TipoMidia = "imagem" | "audio" | "video" | "documento" | "figurinha";
export type Midia = { buffer: Buffer; mime: string; nome?: string | null; tipo: TipoMidia; voz?: boolean };

export function tipoDoMime(mime: string): TipoMidia {
  if (mime === "image/webp") return "figurinha";
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "documento";
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/webm": "webm", "audio/aac": "aac",
  "video/mp4": "mp4", "video/3gpp": "3gp", "application/pdf": "pdf",
};
const extDe = (mime: string, nome?: string | null) =>
  EXT[mime.split(";")[0].trim()] ?? (nome && /\.[a-z0-9]{1,5}$/i.test(nome) ? nome.split(".").pop()!.toLowerCase() : "bin");

export async function salvarMidia(m: Midia): Promise<string> {
  await mkdir(dir(), { recursive: true });
  const arquivo = `${createId()}.${extDe(m.mime, m.nome)}`;
  await writeFile(path.join(dir(), arquivo), m.buffer);
  return arquivo;
}

export async function lerMidia(arquivo: string) {
  if (!/^[a-z0-9]+\.[a-z0-9]{1,5}$/i.test(arquivo)) throw new Error("nome inválido");
  return readFile(path.join(dir(), arquivo));
}

async function ffmpeg(entrada: Buffer, extEntrada: string, args: string[], extSaida: string) {
  const base = path.join(tmpdir(), createId());
  const i = `${base}.${extEntrada}`, o = `${base}.${extSaida}`;
  await writeFile(i, entrada);
  try {
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", i, ...args, o], { timeout: 60_000 });
    return await readFile(o);
  } finally {
    await rm(i, { force: true }); await rm(o, { force: true });
  }
}

/** Áudio gravado no navegador (webm/mp4) → OGG/Opus, o formato de "mensagem de voz" do WhatsApp. */
export async function paraVozWhatsApp(m: Midia): Promise<Midia> {
  if (m.mime.startsWith("audio/ogg")) return { ...m, mime: "audio/ogg; codecs=opus", voz: true };
  const buffer = await ffmpeg(m.buffer, extDe(m.mime), ["-vn", "-c:a", "libopus", "-b:a", "32k", "-ac", "1", "-ar", "48000"], "ogg");
  return { buffer, mime: "audio/ogg; codecs=opus", nome: "audio.ogg", tipo: "audio", voz: true };
}

/** Áudio recebido (OGG/Opus) → MP3, que toca em qualquer navegador (inclusive iPhone). Se falhar, guarda o original. */
export async function paraOuvir(m: Midia): Promise<Midia> {
  if (m.tipo !== "audio" || m.mime.startsWith("audio/mpeg")) return m;
  try {
    const buffer = await ffmpeg(m.buffer, extDe(m.mime), ["-vn", "-c:a", "libmp3lame", "-b:a", "64k"], "mp3");
    return { ...m, buffer, mime: "audio/mpeg" };
  } catch { return m; }
}

export const rotuloMidia = (t: TipoMidia, nome?: string | null) =>
  ({ imagem: "📷 Foto", audio: "🎤 Áudio", video: "🎬 Vídeo", documento: `📄 ${nome || "Documento"}`, figurinha: "Figurinha" })[t];
