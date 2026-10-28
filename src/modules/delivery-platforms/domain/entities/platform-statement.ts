/**
 * Extrato de uma plataforma de delivery, normalizado: o que se vendeu, o que a plataforma descontou
 * (promoções, comissões, marketing, reembolsos, taxas) e o que transferiu. Valores em cêntimos.
 * Nunca guarda dados de clientes (nomes, NIF, notas dos pedidos).
 */

/**
 * Origem do documento: uma plataforma, ou `airmenu` — o SAF-T de vendas do AirMenu, que junta as
 * três plataformas e serve para conferir (não separa por plataforma).
 */
export type DeliveryPlatform = "uber_eats" | "glovo" | "bolt_food" | "airmenu";

/** Tipo de documento importado (cada leitor sabe ler um). */
export type PlatformDocumentKind =
  | "uber_monthly_statement"
  | "glovo_statement"
  | "bolt_orders_report"
  | "bolt_weekly_invoice"
  | "airmenu_saft";

/**
 * Natureza de uma linha do extrato:
 * - `sales` — vendas a preço de tabela (com IVA);
 * - `promotion` — promoções pagas pelo restaurante (desconto sobre a venda, com IVA da venda);
 * - `commission`, `marketing`, `other_fee` — taxas da plataforma (com o IVA que a plataforma cobra);
 * - `refund` — reembolsos, estornos e incidentes de pedidos;
 * - `cash` — vendas já recebidas em dinheiro pelo restaurante (abatem à transferência, não são custo);
 * - `adjustment` — acertos que mexem na transferência mas não são custo do período (ex.: dívida acumulada).
 * Os valores são positivos quando reduzem o que o restaurante recebe (exceto `sales`).
 */
export type StatementLineKind = "sales" | "promotion" | "commission" | "marketing" | "other_fee" | "refund" | "cash" | "adjustment";

export interface StatementLine {
  kind: StatementLineKind;
  /** Rótulo como vem no documento. */
  label: string;
  /** Valor com IVA (o que conta na transferência). */
  grossCents: number;
  /**
   * IVA incluído em `grossCents`: o que a plataforma cobra nas taxas; nas vendas só quando o documento
   * o diz (SAF-T); 0 nos outros casos.
   */
  vatCents: number;
  /** Dia a que a linha se refere, quando o documento separa por dia (pedidos da Bolt, SAF-T). */
  date?: string;
}

/** Uma transferência da plataforma e o período de vendas que paga. */
export interface PlatformPayout {
  periodFrom: string;
  periodTo: string;
  /** Dia em que a plataforma iniciou a transferência, quando o documento o diz. */
  paidOn: string | null;
  netCents: number;
}

export interface PlatformStatement {
  platform: DeliveryPlatform;
  documentKind: PlatformDocumentKind;
  /** Número do extrato/fatura — identifica o documento (importar outra vez substitui). */
  documentNumber: string;
  /** Período de vendas coberto (YYYY-MM-DD, inclusive). */
  periodFrom: string;
  periodTo: string;
  issuedOn: string | null;
  ordersCount: number | null;
  lines: StatementLine[];
  payouts: PlatformPayout[];
  /**
   * O que o documento soma à transferência do período: o total a transferir (Uber, Glovo); as vendas
   * (pedidos da Bolt) ou − o total da fatura (fatura semanal da Bolt), que juntos dão a transferência;
   * no SAF-T, o faturado líquido de notas de crédito.
   */
  netPayoutCents: number;
}

/** Soma das linhas de um tipo. */
export function sumLines(s: Pick<PlatformStatement, "lines">, kind: StatementLineKind, field: "grossCents" | "vatCents" = "grossCents"): number {
  return s.lines.filter((l) => l.kind === kind).reduce((a, l) => a + l[field], 0);
}

/**
 * Transferência calculada a partir das linhas: vendas − tudo o resto. Serve para validar a leitura
 * (tem de dar o total que o documento indica).
 */
export function computedPayoutCents(s: Pick<PlatformStatement, "lines">): number {
  return s.lines.reduce((a, l) => (l.kind === "sales" ? a + l.grossCents : a - l.grossCents), 0);
}
