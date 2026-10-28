import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { UnpaidInvoice } from "../../entities/cash-flow.js";

/** Faturas por pagar (sem pagamento conciliado) com data de competência entre `from` e `to`. */
export interface UnpaidInvoicesReadPort {
  unpaidInvoices(organizationId: OrganizationId, from: string, to: string): Promise<UnpaidInvoice[]>;
}
