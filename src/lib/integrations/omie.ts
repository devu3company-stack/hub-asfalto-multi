import "server-only";
import type { Config } from "./store";

const BASE = "https://app.omie.com.br/api/v1/";

export async function call<T>(cfg: Config, path: string, method: string, param: Record<string, unknown>): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call: method, app_key: cfg.appKey, app_secret: cfg.appSecret, param: [param] }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.faultstring) throw new Error(data?.faultstring ?? `Omie respondeu ${res.status}`);
  return data as T;
}

export async function testOmie(cfg: Config) {
  if (!cfg.appKey || !cfg.appSecret) throw new Error("Informe App Key e App Secret.");
  await call(cfg, "geral/empresas/", "ListarEmpresas", { pagina: 1, registros_por_pagina: 1 });
  return "Conectado ao Omie.";
}

export type Titulo = {
  codigo_lancamento_omie?: number;
  codigo_cliente_fornecedor?: number;
  data_vencimento?: string; // dd/mm/aaaa
  valor_documento?: number;
  status_titulo?: string;
  numero_documento?: string;
};

export async function listarContasReceber(cfg: Config, pagina = 1) {
  const r = await call<{ conta_receber_cadastro?: Titulo[]; total_de_registros?: number }>(
    cfg, "financas/contareceber/", "ListarContasReceber",
    { pagina, registros_por_pagina: 50, apenas_importado_api: "N" },
  );
  return r.conta_receber_cadastro ?? [];
}

export async function listarContasPagar(cfg: Config, pagina = 1) {
  const r = await call<{ conta_pagar_cadastro?: Titulo[]; total_de_registros?: number }>(
    cfg, "financas/contapagar/", "ListarContasPagar",
    { pagina, registros_por_pagina: 50, apenas_importado_api: "N" },
  );
  return r.conta_pagar_cadastro ?? [];
}

export type ProdutoOmie = {
  codigo_produto?: number;
  codigo?: string;
  descricao?: string;
  unidade?: string;
  peso_bruto?: number;
  peso_liq?: number;
  altura?: number; // cm
  largura?: number; // cm
  profundidade?: number; // cm
  valor_unitario?: number;
  inativo?: string; // "S" | "N"
};

/** Todos os produtos do Omie (paginado, 200 por página). */
export async function listarProdutos(cfg: Config) {
  const out: ProdutoOmie[] = [];
  for (let pagina = 1; pagina <= 100; pagina++) {
    const r = await call<{ produto_servico_cadastro?: ProdutoOmie[]; total_de_paginas?: number }>(
      cfg, "geral/produtos/", "ListarProdutos",
      { pagina, registros_por_pagina: 200, apenas_importado_api: "N", filtrar_apenas_omiepdv: "N" },
    );
    out.push(...(r.produto_servico_cadastro ?? []));
    if (pagina >= (r.total_de_paginas ?? 1)) break;
  }
  return out;
}

export type ClienteOmie = {
  codigo_cliente_omie?: number; razao_social?: string; nome_fantasia?: string; email?: string;
  telefone1_ddd?: string; telefone1_numero?: string; cidade?: string; estado?: string; inativo?: string;
};

export async function listarClientes(cfg: Config) {
  const out: ClienteOmie[] = [];
  for (let pagina = 1; pagina <= 200; pagina++) {
    const r = await call<{ clientes_cadastro?: ClienteOmie[]; total_de_paginas?: number }>(
      cfg, "geral/clientes/", "ListarClientes", { pagina, registros_por_pagina: 500, apenas_importado_api: "N" },
    );
    out.push(...(r.clientes_cadastro ?? []));
    if (pagina >= (r.total_de_paginas ?? 1)) break;
  }
  return out;
}

type PedidoOmie = {
  cabecalho?: { codigo_cliente?: number; data_previsao?: string; etapa?: string };
  infoCadastro?: { dInc?: string; cancelado?: string };
  total_pedido?: { valor_total_pedido?: number };
};

/** Pedidos de venda desde a data (para saber a última compra de cada cliente). */
export async function listarPedidosVenda(cfg: Config, desde: Date) {
  const d = `${String(desde.getDate()).padStart(2, "0")}/${String(desde.getMonth() + 1).padStart(2, "0")}/${desde.getFullYear()}`;
  const out: PedidoOmie[] = [];
  for (let pagina = 1; pagina <= 200; pagina++) {
    const r = await call<{ pedido_venda_produto?: PedidoOmie[]; total_de_paginas?: number }>(
      cfg, "produtos/pedido/", "ListarPedidos", { pagina, registros_por_pagina: 100, apenas_importado_api: "N", filtrar_por_data_de: d },
    );
    out.push(...(r.pedido_venda_produto ?? []));
    if (pagina >= (r.total_de_paginas ?? 1)) break;
  }
  return out;
}

export type SaldoOmie = { nCodProd?: number; cCodigo?: string; cDescricao?: string; nSaldo?: number; fisico?: number };

/** Posição de estoque de hoje (todos os produtos com movimento). */
export async function listarEstoque(cfg: Config) {
  const hoje = new Date();
  const d = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
  const out: SaldoOmie[] = [];
  for (let pagina = 1; pagina <= 200; pagina++) {
    const r = await call<{ produtos?: SaldoOmie[]; nTotPaginas?: number }>(
      cfg, "estoque/consulta/", "ListarPosEstoque", { nPagina: pagina, nRegPorPagina: 500, dDataPosicao: d, cExibeTodos: "N", codigo_local_estoque: 0 },
    );
    out.push(...(r.produtos ?? []));
    if (pagina >= (r.nTotPaginas ?? 1)) break;
  }
  return out;
}
