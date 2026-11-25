"use client";
import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { enviar } from "./actions";

const ACEITA = "image/*,video/mp4,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.dwg,.ppt,.pptx";

function Enviar({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button aria-label="Enviar" disabled={pending || disabled}
      className="w-11 h-11 shrink-0 rounded-full bg-brand text-white flex items-center justify-center disabled:opacity-50">
      {pending ? <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" /> :
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3 20.5V3.5L22 12 3 20.5Zm2-3.1L16.9 12 5 6.6v3.9l6 1.5-6 1.5v3.9Z" /></svg>}
    </button>
  );
}

const fmtSeg = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function SendForm({ chat, numero }: { chat?: string; numero?: string }) {
  const [state, action] = useFormState(enviar, undefined);
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [voz, setVoz] = useState(false);
  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const [seg, setSeg] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const cancelar = useRef(false);

  function limpar() {
    setArquivo(null); setVoz(false); setTexto("");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = "";
  }
  useEffect(() => { if (state?.ok) { form.current?.reset(); limpar(); textRef.current?.focus(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  function escolher(f: File | null, eVoz = false) {
    if (preview) URL.revokeObjectURL(preview);
    setArquivo(f); setVoz(eVoz);
    setPreview(f && (f.type.startsWith("image/") || f.type.startsWith("audio/") || f.type.startsWith("video/")) ? URL.createObjectURL(f) : null);
    if (f && fileInput.current && fileInput.current.files?.[0] !== f) {
      const dt = new DataTransfer(); dt.items.add(f); fileInput.current.files = dt.files;
    }
  }

  async function gravar() {
    if (!navigator.mediaDevices?.getUserMedia) return alert("Este navegador não grava áudio.");
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return alert("Libere o microfone no navegador para gravar áudio."); }
    const tipo = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
    const r = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    const partes: Blob[] = [];
    cancelar.current = false;
    r.ondataavailable = (e) => e.data.size && partes.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setGravando(false);
      if (cancelar.current || !partes.length) return;
      const mime = (r.mimeType || "audio/webm").split(";")[0];
      const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
      escolher(new File(partes, `audio.${ext}`, { type: mime }), true);
    };
    rec.current = r; r.start(); setGravando(true); setSeg(0);
  }
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSeg((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);

  const vazio = !texto.trim() && !arquivo;

  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      {chat ? <input type="hidden" name="chat" value={chat} /> : (
        <div>
          <label htmlFor="wa-num" className="label">Número (com DDD)</label>
          <input id="wa-num" name="chat" inputMode="tel" placeholder="5519999999999" defaultValue={numero} className="input" required />
        </div>
      )}
      <input ref={fileInput} type="file" name="arquivo" accept={ACEITA} className="hidden" aria-label="Anexar arquivo"
        onChange={(e) => escolher(e.target.files?.[0] ?? null)} />
      <input type="hidden" name="voz" value={voz ? "1" : "0"} />

      {arquivo && (
        <div className="flex items-center gap-3 p-2 rounded-xl bg-white border border-surface-line">
          {preview && arquivo.type.startsWith("image/") && /* eslint-disable-next-line @next/next/no-img-element */ <img src={preview} alt="" className="w-14 h-14 object-cover rounded-lg" />}
          {preview && arquivo.type.startsWith("audio/") ? <audio src={preview} controls className="h-10 flex-1 min-w-0" /> :
            <div className="flex-1 min-w-0 text-sm"><p className="font-semibold truncate">{arquivo.name}</p><p className="text-xs text-graphite-muted">{(arquivo.size / 1024 / 1024).toFixed(1)} MB</p></div>}
          <button type="button" onClick={limpar} aria-label="Remover anexo" className="w-9 h-9 rounded-full hover:bg-surface text-graphite text-lg">×</button>
        </div>
      )}

      {gravando ? (
        <div className="flex items-center gap-3 min-h-[44px]">
          <button type="button" onClick={() => { cancelar.current = true; rec.current?.stop(); }} className="btn-outline h-11">Cancelar</button>
          <span className="flex items-center gap-2 text-sm font-semibold text-[#A0261C]" role="status"><span className="w-2.5 h-2.5 rounded-full bg-[#D0342C] animate-pulse" />Gravando {fmtSeg(seg)}</span>
          <button type="button" onClick={() => rec.current?.stop()} className="btn-primary h-11 ml-auto">Parar</button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} aria-label="Anexar foto ou arquivo" title="Foto, vídeo ou arquivo"
            className="w-11 h-11 shrink-0 rounded-full hover:bg-surface text-graphite flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>
          </button>
          <label htmlFor={`wa-text-${chat ?? "novo"}`} className="sr-only">Mensagem</label>
          <textarea ref={textRef} id={`wa-text-${chat ?? "novo"}`} name="text" rows={1} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder={arquivo ? (voz ? "Áudio pronto para enviar" : "Legenda (opcional)") : "Mensagem"} disabled={voz}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!vazio) form.current?.requestSubmit(); } }}
            className="input h-auto min-h-[44px] max-h-40 py-2.5 flex-1 resize-none" />
          {vazio ? (
            <button type="button" onClick={gravar} aria-label="Gravar áudio" title="Gravar áudio"
              className="w-11 h-11 shrink-0 rounded-full bg-brand text-white flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2Z" /></svg>
            </button>
          ) : <Enviar />}
        </div>
      )}
      {state?.message && !state.ok && <p role="alert" className="text-sm text-[#A0261C]">{state.message}</p>}
    </form>
  );
}
