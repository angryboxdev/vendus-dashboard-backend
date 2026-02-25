export type CustosVariaveisItem = {
  id: string;
  descricao: string;
  valor: number;
  valorSemIva: number;
  observacao: string;
};

export type CustosVariaveisPayload = {
  producao: CustosVariaveisItem[];
  venda: CustosVariaveisItem[];
};

export type DRE_CategoriaCustosVariaveis = "producao" | "venda";

export type CustosVariaveisItemBody = {
  descricao: string;
  valor: number;
  valorSemIva: number;
  observacao: string;
};

export type CustosVariaveisCreateBody = CustosVariaveisItemBody & {
  section: DRE_CategoriaCustosVariaveis;
};

export type CustosVariaveisUpdateBody = CustosVariaveisItemBody & {
  id?: string;
};

// Custos fixos: mesma estrutura de item, resposta é uma lista só (sem categoria)
export type CustosFixoItem = {
  id: string;
  descricao: string;
  valor: number;
  valorSemIva: number;
  observacao: string;
};

export type CustosFixosCreateBody = CustosVariaveisItemBody;
export type CustosFixosUpdateBody = CustosVariaveisItemBody & { id?: string };

// Receita bruta: 3 categorias (dinheiro, tpa, apps), campo taxa em vez de valorSemIva
export type ReceitaBrutaItem = {
  id: string;
  descricao: string;
  valor: number;
  taxa: number;
};

export type ReceitaBrutaPayload = {
  dinheiro: ReceitaBrutaItem[];
  tpa: ReceitaBrutaItem[];
  apps: ReceitaBrutaItem[];
  tax_amount: number;
};

export type DRE_CategoriaReceitaBruta = "dinheiro" | "tpa" | "apps";

export type ReceitaBrutaItemBody = {
  descricao: string;
  valor: number;
  taxa: number;
};

export type ReceitaBrutaCreateBody = ReceitaBrutaItemBody & {
  section: DRE_CategoriaReceitaBruta;
};

export type ReceitaBrutaUpdateBody = ReceitaBrutaItemBody & { id?: string };

/** KPIs do DRE (monthly summary + custos variáveis/fixos) */
export type DREKpisPayload = {
  /** Nº de vendas loja (by_channel.restaurant.totals.documents_count) */
  vendas_loja: number;
  /** Nº de vendas apps (by_channel.delivery.totals.documents_count) */
  vendas_apps: number;
  /** Nº de vendas totais (totals.documents_count) */
  vendas_totais: number;
  /** Ticket médio bruto = totals.gross / vendas_totais */
  ticket_medio_bruto: number;
  /** Ticket médio líquido = totals.net / vendas_totais */
  ticket_medio_liquido: number;
  /** Receita % Loja = receita loja / receita total (0..1) */
  receita_pct_loja: number;
  /** Receita % Apps = receita apps / receita total (0..1) */
  receita_pct_apps: number;
  /** CMV % = Custos Variáveis Produção / receita líquida (totals.net) */
  cmv_pct: number;
  /** Custo Fixo % = Custos Fixos Totais / receita líquida */
  custo_fixo_pct: number;
};
