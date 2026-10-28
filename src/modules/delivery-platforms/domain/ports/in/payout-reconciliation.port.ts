import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PayoutReconciliation } from "../../entities/payout-reconciliation.js";

/** Conferência das transferências das plataformas que pagam as vendas de um mês. */
export interface GetPayoutReconciliationPort {
  execute(input: { organizationId: OrganizationId; year: number; month: number }): Promise<PayoutReconciliation>;
}
