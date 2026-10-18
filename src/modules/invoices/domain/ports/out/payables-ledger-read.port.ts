import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface LedgerPayable {
  id: string;
  invoiceId: string | null;
  status: string;
  amountCents: number;
  dueDate: string | null;
  supplierId: string | null;
  supplierName: string;
  description: string;
}

/**
 * Leitura do razão de contas a pagar (F2 v1.2 §2.3): obrigações ativas e
 * pagamentos reconhecidos (alocações de movimentos bancários). Só leitura.
 */
export interface PayablesLedgerReadPort {
  listActivePayables(organizationId: OrganizationId): Promise<LedgerPayable[]>;
  /** Soma das alocações por fatura e por conta a pagar (cêntimos, com sinal). */
  allocatedByEntity(organizationId: OrganizationId): Promise<{ invoice: Map<string, number>; payable: Map<string, number> }>;
}
