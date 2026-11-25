import "server-only";
import { rodarAutomacoes } from "./automacoes";
import { processarFila } from "./envio";
import { rotinasPedidos } from "../pedidos";

/** Roda dentro do servidor do hub: a cada minuto agenda automações/campanhas e envia a fila. */
export function iniciarWorkerEmail() {
  const g = globalThis as unknown as { __emailWorker?: NodeJS.Timeout };
  if (g.__emailWorker) return;
  let ocupado = false;
  const tick = async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      await rodarAutomacoes();
      await processarFila();
      await rotinasPedidos();
    } catch (e) {
      console.error("worker de e-mail:", e instanceof Error ? e.message : e);
    } finally {
      ocupado = false;
    }
  };
  g.__emailWorker = setInterval(tick, 60_000);
  setTimeout(tick, 15_000);
}
