"use server";
import { revalidatePath } from "next/cache";
import { audit, requireModule } from "@/lib/auth";
import { analisar, importarHistorico, normalizarVeiculo, salvarParametros } from "@/lib/frete/historico";
import type { FormMsg } from "@/components/ActionForm";
import type { AnaliseJSON } from "@/components/AnaliseFrete";

const n = (f: FormData, k: string) => {
  const s = String(f.get(k) ?? "").replace(/[R$\s]/g, "");
  const v = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(v) ? v : 0;
};

export async function importar(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireModule("fretes", "edit");
  const arq = f.get("arquivo");
  if (!(arq instanceof File) || !arq.size) return { ok: false, message: "Escolha a planilha (.xlsx ou .xlsm)." };
  try {
    const r = await importarHistorico(Buffer.from(await arq.arrayBuffer()));
    await audit(u.id, "fretes.historico.importar", `${r.importadas} linhas`);
    revalidatePath("/fretes/historico");
    revalidatePath("/fretes/planilhas");
    return { ok: true, message: `${r.importadas} fretes importados da aba "${r.aba}"${r.ignoradas ? ` (${r.ignoradas} linha(s) incompletas ignoradas)` : ""}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Não consegui ler a planilha." };
  }
}

export async function salvarParams(_p: FormMsg, f: FormData): Promise<FormMsg> {
  await requireModule("fretes", "edit");
  const p = { minAmostra: Math.max(1, Math.round(n(f, "minAmostra"))), pesoTol: Math.max(0, n(f, "pesoTol")), distTol: Math.max(0, n(f, "distTol")), mesmaUF: f.get("mesmaUF") === "sim" };
  await salvarParametros(p);
  revalidatePath("/fretes/historico");
  return { ok: true, message: "Parâmetros salvos." };
}

export type AvaliarState = { ok: boolean; message?: string; analise?: AnaliseJSON } | undefined;

export async function avaliar(_p: AvaliarState, f: FormData): Promise<AvaliarState> {
  await requireModule("fretes");
  const kg = n(f, "kg"), km = n(f, "km"), veiculo = normalizarVeiculo(String(f.get("veiculo") ?? ""));
  if (!kg || !km || !veiculo) return { ok: false, message: "Informe veículo, peso e distância." };
  const a = await analisar({ kg, km, veiculo, uf: String(f.get("uf") ?? "") || null, cotado: n(f, "cotado") || null });
  return { ok: true, analise: { ...a, exemplos: a.exemplos.map((x) => ({ ...x, data: x.data.toISOString() })) } };
}
