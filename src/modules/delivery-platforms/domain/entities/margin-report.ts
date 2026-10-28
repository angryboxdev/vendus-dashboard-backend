import type { DeliveryPlatform, PlatformDocumentKind } from "./platform-statement.js";

/**
 * Relatório de margem por plataforma de um mês (F3): quanto cada plataforma vendeu, quanto ficou
 * (promoções, comissões, marketing, reembolsos e taxas) e quanto sobra — antes e depois da comida.
 * Valores em cêntimos; percentagens sobre as vendas a preço de tabela sem IVA.
 */

/**
 * Como a parte do mês foi calculada para um documento:
 * - `month` — o período cabe todo no mês;
 * - `daily` — o documento traz os dias (pedidos da Bolt, SAF-T): contam só os dias do mês;
 * - `orders` — pelas vendas diárias do relatório de pedidos da Bolt (faturas semanais);
 * - `saft` — pelo faturado diário do SAF-T (decisão do utilizador, 2026-10-28);
 * - `days` — pela proporção de dias, sem dados diários (estimativa).
 */
export type AllocationBasis = "month" | "daily" | "orders" | "saft" | "days";

export interface AllocatedDocument {
  platform: DeliveryPlatform;
  documentKind: PlatformDocumentKind;
  documentNumber: string;
  periodFrom: string;
  periodTo: string;
  /** Parte do documento que pertence ao mês (0–1). */
  share: number;
  basis: AllocationBasis;
}

export interface PlatformMargin {
  platform: Exclude<DeliveryPlatform, "airmenu"> | "total";
  documents: number;
  ordersCount: number;
  // Com IVA, como nos extratos.
  salesGrossCents: number;
  promotionsGrossCents: number;
  /** Vendas − promoções: o que os clientes pagaram. */
  paidByCustomersCents: number;
  /** Comissões, marketing, outras taxas e reembolsos, com o IVA que a plataforma cobra. */
  platformFeesGrossCents: number;
  feesVatCents: number;
  /** Parte de `feesVatCents` que é IVA da comissão. */
  commissionVatCents: number;
  cashCents: number;
  /** Líquido dos documentos (transferido; na Bolt, calculado). */
  netPayoutCents: number;
  // Sem IVA.
  salesNetCents: number;
  promotionsNetCents: number;
  invoicedNetCents: number;
  salesVatCents: number;
  commissionNetCents: number;
  marketingNetCents: number;
  /** Outras taxas (sem IVA) + reembolsos. */
  otherNetCents: number;
  grossMarginCents: number;
  grossMarginPct: number | null;
  /** Comida e embalagem, estimadas (`foodCostPct` do faturado sem IVA). */
  foodCostCents: number;
  netMarginCents: number;
  netMarginPct: number | null;
  netMarginPerOrderCents: number | null;
  /** IVA das vendas − IVA das taxas da plataforma. */
  vatToPayCents: number;
}

export interface MarginReport {
  period: { year: number; month: number; from: string; to: string };
  /** IVA médio das vendas (ex.: 0,1325): do SAF-T do mês ou o de omissão. */
  salesVatRate: number;
  salesVatRateSource: "saft" | "default";
  /** Hipótese do custo da comida e embalagem, % do faturado sem IVA. */
  foodCostPct: number;
  platforms: PlatformMargin[];
  total: PlatformMargin;
  /** SAF-T do mês × o que os clientes pagaram segundo os extratos (com IVA); null sem SAF-T. */
  saft: { invoicedCents: number; platformsPaidCents: number; differenceCents: number } | null;
  documents: AllocatedDocument[];
  warnings: string[];
}
