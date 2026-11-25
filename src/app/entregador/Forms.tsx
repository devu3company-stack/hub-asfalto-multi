"use client";
import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { aceitar, coletar, entrar, entregar, type Msg } from "./actions";

function Botao({ children, busy, className = "btn-primary w-full h-14 text-base" }: { children: React.ReactNode; busy: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? busy : children}</button>;
}
function Aviso({ st }: { st: Msg }) {
  if (!st?.message) return null;
  return <p role={st.ok ? "status" : "alert"} className={`text-sm font-semibold ${st.ok ? "text-[#1E6B34]" : "text-[#A0261C]"}`}>{st.message}</p>;
}

export function EntrarForm({ volta }: { volta?: string }) {
  const [st, run] = useFormState(entrar, undefined);
  return (
    <form action={run} className="card flex flex-col gap-3">
      <input type="hidden" name="volta" value={volta ?? ""} />
      <div><label htmlFor="telefone" className="label">Seu WhatsApp (com DDD)</label>
        <input id="telefone" name="telefone" type="tel" inputMode="tel" autoComplete="tel" required className="input h-12 text-base" placeholder="19 99999-0000" /></div>
      <div><label htmlFor="senha" className="label">Senha (6 números)</label>
        <input id="senha" name="senha" type="password" inputMode="numeric" autoComplete="current-password" required maxLength={6} className="input h-12 text-base tracking-widest" /></div>
      <Botao busy="Entrando...">Entrar</Botao>
      <Aviso st={st} />
    </form>
  );
}

export function AceitarForm({ id }: { id: string }) {
  const [st, run] = useFormState(aceitar, undefined);
  const router = useRouter();
  useEffect(() => { if (st) router.refresh(); }, [st, router]);
  return (
    <form action={run} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <Botao busy="Aceitando...">Aceitar este frete</Botao>
      <Aviso st={st} />
    </form>
  );
}

export function ColetarForm({ id }: { id: string }) {
  const [st, run] = useFormState(coletar, undefined);
  return (
    <form action={run} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <Botao busy="Registrando...">Coletei a carga</Botao>
      <Aviso st={st} />
    </form>
  );
}

/** Reduz a foto no próprio celular (máx. 1600 px) para enviar rápido mesmo com sinal fraco. */
async function reduzir(f: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.82));
    return blob ? new File([blob], "canhoto.jpg", { type: "image/jpeg" }) : f;
  } catch { return f; }
}

export function EntregarForm({ id }: { id: string }) {
  const [st, run] = useFormState(entregar, undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; precisao: number } | null>(null);
  const [gpsMsg, setGpsMsg] = useState("Pegando sua localização...");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!navigator.geolocation) { setGpsMsg("Este celular não informa a localização."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy }); setGpsMsg("Localização registrada ✓"); },
      () => setGpsMsg("Localização não liberada. Libere nas permissões do navegador para registrar o local da entrega."),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  }, []);

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const menor = await reduzir(f);
    const dt = new DataTransfer(); dt.items.add(menor);
    if (input.current) input.current.files = dt.files;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(menor));
  }

  return (
    <form action={run} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      {gps && (<><input type="hidden" name="lat" value={gps.lat} /><input type="hidden" name="lng" value={gps.lng} /><input type="hidden" name="precisao" value={gps.precisao} /></>)}
      <label className="flex flex-col items-center justify-center gap-2 min-h-[140px] rounded-2xl border-2 border-dashed border-brand bg-brand-soft text-brand-text font-semibold cursor-pointer text-center p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview ? <img src={preview} alt="Foto do canhoto" className="max-h-60 rounded-xl" /> : <><span className="text-3xl" aria-hidden>📷</span>Tirar foto do canhoto assinado</>}
        <input ref={input} type="file" name="foto" accept="image/*" capture="environment" required onChange={escolher} className="sr-only" />
      </label>
      {preview && <p className="text-xs text-graphite text-center">Toque na foto para tirar outra.</p>}
      <div><label htmlFor="recebedor" className="label">Quem recebeu (opcional)</label><input id="recebedor" name="recebedor" className="input h-12 text-base" /></div>
      <p className="text-xs text-graphite" role="status">{gpsMsg}</p>
      <Botao busy="Enviando...">Finalizar entrega</Botao>
      <Aviso st={st} />
    </form>
  );
}
