/**
 * Histórico semanal do preço de compra de um ingrediente (task V5 §5). Fonte: linhas de compra
 * confirmadas para o Stock (revisão aplicada), já com o desconto da linha. Custos s/ IVA, em cêntimos
 * por unidade base do artigo (g, ml, un) — a interface converte para €/kg ou €/l.
 */
export interface PurchaseObservation {
  /** Linha da revisão de Stock (identidade única da observação). */
  lineId: string;
  /** Compra por rever de origem (para abrir o documento). */
  reviewId?: string;
  supplierId?: string | null;
  supplierName: string;
  invoiceNumber: string;
  /** Data da fatura (data económica da compra), YYYY-MM-DD. */
  invoiceDate: string;
  /** Quantidade na unidade base do artigo. */
  quantity: number;
  /** Valor bruto da linha antes de descontos (cêntimos); null quando não se sabe. */
  grossCents: number | null;
  /** Desconto da linha (cêntimos). */
  discountCents: number | null;
  /** Custo líquido s/ IVA da linha (cêntimos), depois do desconto. */
  netCents: number;
}

export interface WeeklyPricePoint {
  /** Semana ISO 8601, ex. «2026-W41». */
  week: string;
  /** Segunda-feira da semana, YYYY-MM-DD. */
  weekStart: string;
  /** Soma das quantidades compradas na semana (0 = sem nova compra). */
  quantity: number;
  netCents: number;
  /** Média ponderada (custo total ÷ quantidade total), cêntimos por unidade base; null sem compras. */
  avgCentsPerUnit: number | null;
  /** Sem compras: último preço confirmado anterior (referência, não pago nesta semana). */
  carriedCentsPerUnit: number | null;
  /** Semana de onde vem o preço transportado. */
  carriedFromWeek: string | null;
  /** Variação face à última semana anterior com compras (0,1 = +10%); null sem comparação. */
  changeRatio: number | null;
  /** Semana em curso (dados parciais). */
  partial: boolean;
  observations: PurchaseObservation[];
}

export interface IngredientPriceHistory {
  stockItemId: string;
  name: string;
  baseUnit: string;
  weeks: WeeklyPricePoint[];
  lastPurchase: { invoiceDate: string; supplierName: string; centsPerUnit: number } | null;
}
