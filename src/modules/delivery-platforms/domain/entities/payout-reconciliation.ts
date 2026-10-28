import type { DeliveryPlatform } from "./platform-statement.js";

type Platform = Exclude<DeliveryPlatform, "airmenu">;

/** Um crédito de uma plataforma no banco (a liquidação, já sem as taxas). */
export interface PlatformBankCredit {
  id: string;
  platform: Platform;
  /** Data do movimento (YYYY-MM-DD). */
  date: string;
  amountCents: number;
}

/**
 * Estado de uma transferência esperada:
 * - `ok` — entrou no banco com o valor do documento (±2 cêntimos);
 * - `difference` — entrou um crédito plausível, mas com outro valor;
 * - `pending` — ainda não entrou (o banco está importado só até antes de a transferência ser devida);
 * - `missing` — devia já ter entrado e não há crédito correspondente.
 */
export type PayoutStatus = "ok" | "difference" | "pending" | "missing";

export interface ExpectedPayout {
  platform: Platform;
  /** Período de vendas que a transferência paga. */
  periodFrom: string;
  periodTo: string;
  /** Data indicada no documento, quando a diz (Uber). */
  paidOn: string | null;
  expectedCents: number;
  /** Último dia em que se espera o crédito no banco. */
  dueBy: string;
  received: { creditId: string; date: string; amountCents: number } | null;
  differenceCents: number | null;
  status: PayoutStatus;
}

export interface PlatformPayoutTotals {
  platform: Platform;
  expectedCents: number;
  receivedCents: number;
  /** Recebido − esperado nas transferências já recebidas. */
  differenceCents: number;
  pendingCents: number;
}

/**
 * Conferência das transferências que pagam as vendas de um mês: o que os documentos dizem que a
 * plataforma transfere × o que entrou no banco (F4). Valores em cêntimos.
 */
export interface PayoutReconciliation {
  period: { year: number; month: number; from: string; to: string };
  /** Último dia com movimentos importados do banco (null sem movimentos). */
  bankCoverageTo: string | null;
  payouts: ExpectedPayout[];
  totals: PlatformPayoutTotals[];
  /** Créditos das plataformas no mês sem transferência esperada (outro mês, ou sem documento importado). */
  unmatchedCredits: PlatformBankCredit[];
  warnings: string[];
}
