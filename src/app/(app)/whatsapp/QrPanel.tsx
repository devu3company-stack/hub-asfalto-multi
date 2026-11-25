"use client";
import { useEffect, useState } from "react";

type S = { status: string; qr: string | null; number: string | null; name: string | null };

const LABEL: Record<string, { t: string; c: string }> = {
  conectado: { t: "Conectado", c: "bg-[#E3F1E6] text-[#1E6B34]" },
  aguardando_qr: { t: "Aguardando leitura do QR", c: "bg-brand-soft text-brand-text" },
  conectando: { t: "Conectando...", c: "bg-brand-soft text-brand-text" },
  desconectado: { t: "Desconectado", c: "bg-[#E6E4E3] text-[#3E3B3C]" },
  indisponivel: { t: "Serviço indisponível", c: "bg-[#FBE3E1] text-[#A0261C]" },
};

/** Mostra o estado da conexão por QR e o QR code, atualizando a cada 3 segundos. */
export default function QrPanel({ conexao, initial, children, semQr }: { conexao: string; initial: S; children?: React.ReactNode; semQr?: React.ReactNode }) {
  const [s, setS] = useState<S>(initial);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await fetch(`/api/whatsapp/status?c=${encodeURIComponent(conexao)}`, { cache: "no-store" }).catch(() => null);
      if (alive && r?.ok) setS(await r.json());
    };
    const id = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [conexao]);

  const l = LABEL[s.status] ?? LABEL.desconectado;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${l.c}`}>{l.t}</span>
        {s.number && <span className="text-sm text-graphite">+{s.number}{s.name ? ` · ${s.name}` : ""}</span>}
      </div>
      {s.status === "aguardando_qr" && s.qr && (
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.qr} alt="QR code para conectar o WhatsApp" className="w-56 h-56 rounded-xl border border-surface-line bg-white p-2" />
          <ol className="text-sm text-graphite list-decimal pl-5 flex flex-col gap-1">
            <li>Abra o WhatsApp no celular deste número.</li>
            <li>Toque em Mais opções › Aparelhos conectados.</li>
            <li>Toque em Conectar um aparelho e aponte para este QR.</li>
          </ol>
        </div>
      )}
      {s.status === "indisponivel" && (
        <p className="text-sm text-graphite-muted">O serviço de conexão não respondeu. Ele está no container <code>whatsapp</code> da VPS.</p>
      )}
      {s.status === "desconectado" && semQr}
      {s.status === "conectado" && children}
    </div>
  );
}
