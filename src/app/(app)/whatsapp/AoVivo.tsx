"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Atualiza a conversa sozinha e mantém a rolagem no fim (inclusive quando fotos terminam de carregar). */
export default function AoVivo({ chave, ultima }: { chave: string; ultima: string }) {
  const router = useRouter();
  const colado = useRef(true);
  const chaveVista = useRef("");

  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 6000);
    return () => clearInterval(t);
  }, [router]);

  useEffect(() => {
    const el = document.getElementById("wa-msgs");
    if (!el) return;
    if (chaveVista.current !== chave) { colado.current = true; chaveVista.current = chave; }
    const fim = () => { if (colado.current) el.scrollTop = el.scrollHeight; };
    const onScroll = () => { colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150; };
    fim();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(fim);
    Array.from(el.children).forEach((c) => ro.observe(c));
    el.querySelectorAll("img,video").forEach((m) => m.addEventListener("load", fim, { once: true }));
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); };
  }, [chave, ultima]);
  return null;
}
