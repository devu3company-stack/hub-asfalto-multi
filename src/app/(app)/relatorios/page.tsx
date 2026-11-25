import { requireModule } from "@/lib/auth";
import EmBreve from "@/components/EmBreve";

export default async function Page() {
  await requireModule("relatorios");
  return <EmBreve title="Relatórios" fase="Fase 3" itens={["Investimento, cliques e conversões do Google Ads por campanha", "Investimento × vendas no período", "Exportação em planilha"]} />;
}
