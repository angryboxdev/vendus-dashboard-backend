import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CashFlowToHandle } from "../../entities/cash-flow.js";

/** Painel «Para tratar» do fluxo de caixa: o que está a pagar e os documentos por arrumar. */
export interface GetCashFlowToHandlePort {
  execute(params: { organizationId: OrganizationId }): Promise<CashFlowToHandle>;
}
