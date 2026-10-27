import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Pagamento de uma ocorrência de recorrência (módulo payable-recurrences, via adapter): um movimento
 * ligado a uma ocorrência deixa-a «paga» (mesmo com valor diferente do previsto — decisão do utilizador);
 * desconciliar o movimento reabre-a, se foi ele que a pagou.
 */
export interface OccurrencePaymentPort {
  settle(organizationId: OrganizationId, input: { occurrenceId: string; movementId: string; paidAt: string; bankAccountId: string | null }): Promise<void>;
  reopen(organizationId: OrganizationId, input: { occurrenceId: string; movementId: string }): Promise<void>;
}
