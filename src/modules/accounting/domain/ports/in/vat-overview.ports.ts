import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { VatPeriodicity } from "../../services/vat-period.service.js";
import type { AccountingDocumentSource } from "./accounting-documents.ports.js";

export interface VatRateBreakdownDTO {
  rate: number;
  salesVat: number;
  purchasesVatDeductible: number;
  purchasesVatNonDeductible: number;
  balance: number;
}

/**
 * Drill-down por documento/tipo/origem (secção 10 da task) — só para as
 * compras (a venda já tem o seu próprio detalhe em `vendus`). Não inclui os
 * documentos de venda porque `SalesVatReadPort` só devolve agregados por
 * taxa, nunca linha a linha (ver adapter).
 */
export interface VatDocumentBreakdownDTO {
  id: string;
  source: AccountingDocumentSource;
  documentType: string;
  fundingSource: string | null;
  entityName: string;
  date: string;
  vatAmount: number;
  vatDeductibleAmount: number;
  vatNonDeductibleAmount: number;
}

export interface VatOverviewResultDTO {
  period: { periodicity: VatPeriodicity; year: number; period: number; from: string; to: string };
  salesVatTotal: number;
  purchasesVatDeductibleTotal: number;
  purchasesVatNonDeductibleTotal: number;
  /** salesVatTotal − purchasesVatDeductibleTotal. Positivo = a pagar ao Estado; negativo = crédito. */
  balance: number;
  byRate: VatRateBreakdownDTO[];
  documents: VatDocumentBreakdownDTO[];
}

export interface GetVatOverviewCommand {
  organizationId: OrganizationId;
  year: number;
  period: number;
}

/**
 * "Apuramento de IVA". Nunca recalcula IVA de vendas (`vendus`) nem de
 * compras (`invoices`/`accounting_documents`) do zero — só agrega o que
 * esses módulos já calculam. A periodicidade (mensal/trimestral) vem da
 * configuração da organização (`AccountingSettingsRepositoryPort`), nunca
 * hardcoded.
 */
export interface GetVatOverviewPort {
  execute(command: GetVatOverviewCommand): Promise<VatOverviewResultDTO>;
}
