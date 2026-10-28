import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DeliveryPlatform, PlatformDocumentKind } from "../../entities/platform-statement.js";

/** Resumo de um extrato importado (totais por natureza, com IVA). */
export interface PlatformStatementSummary {
  id: string;
  platform: DeliveryPlatform;
  documentKind: PlatformDocumentKind;
  documentNumber: string;
  periodFrom: string;
  periodTo: string;
  issuedOn: string | null;
  ordersCount: number | null;
  salesCents: number;
  /** IVA incluído nas vendas, quando o documento o diz (SAF-T); 0 nos extratos das plataformas. */
  salesVatCents: number;
  promotionsCents: number;
  commissionCents: number;
  marketingCents: number;
  otherFeesCents: number;
  refundsCents: number;
  cashCents: number;
  /** Acertos que mexem na transferência mas não são custo do período (ex.: dívida acumulada). */
  adjustmentsCents: number;
  /** IVA incluído nas taxas (comissão, marketing, outras). */
  feesVatCents: number;
  netPayoutCents: number;
  fileName: string;
  importedAt: string;
}

/** Extratos importados cujo período toca o mês pedido. */
export interface ListPlatformStatementsPort {
  execute(input: { organizationId: OrganizationId; year: number; month: number }): Promise<PlatformStatementSummary[]>;
}
