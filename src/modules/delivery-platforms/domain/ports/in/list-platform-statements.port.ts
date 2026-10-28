import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DeliveryPlatform } from "../../entities/platform-statement.js";

/** Resumo de um extrato importado (totais por natureza, com IVA). */
export interface PlatformStatementSummary {
  id: string;
  platform: DeliveryPlatform;
  documentNumber: string;
  periodFrom: string;
  periodTo: string;
  issuedOn: string | null;
  ordersCount: number | null;
  salesCents: number;
  promotionsCents: number;
  commissionCents: number;
  marketingCents: number;
  otherFeesCents: number;
  refundsCents: number;
  cashCents: number;
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
