import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { SalesReconciliation } from "../../entities/sales-reconciliation.js";

/** Conferência do mês: vendas do restaurante no Vendus × entradas no banco (TPA e depósitos). */
export interface GetSalesReconciliationPort {
  execute(params: { organizationId: OrganizationId; year: number; month: number }): Promise<SalesReconciliation>;
}
