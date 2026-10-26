import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CashFlowReport } from "../../entities/cash-flow.js";

export interface GetCashFlowParams {
  organizationId: OrganizationId;
  year: number;
  month: number;
}

/** Fluxo de caixa do mês (Mapa de rentabilidade → Fluxo de caixa). */
export interface GetCashFlowPort {
  execute(params: GetCashFlowParams): Promise<CashFlowReport>;
}
