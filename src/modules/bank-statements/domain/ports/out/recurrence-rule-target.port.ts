import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface RecurrenceRuleTarget {
  id: string;
  name: string;
  status: "active" | "paused" | "closed";
  requireInvoice: boolean;
}

/**
 * Recorrência ligada a um «movimento recorrente» (módulo payable-recurrences, via adapter). `settle` escolhe
 * a ocorrência do mês a que o pagamento se refere (gera-a se faltar) e deixa-a paga; devolve `null` quando
 * não há uma resposta segura (mês já pago por outro movimento, com fatura, fora do período…) — o movimento
 * fica «Por conciliar».
 */
export interface RecurrenceRuleTargetPort {
  describe(organizationId: OrganizationId, recurrenceId: string): Promise<RecurrenceRuleTarget | null>;
  settle(
    organizationId: OrganizationId,
    input: { recurrenceId: string; movementId: string; paidAt: string; bankAccountId: string | null },
  ): Promise<{ occurrenceId: string; paidNow: boolean } | null>;
}
