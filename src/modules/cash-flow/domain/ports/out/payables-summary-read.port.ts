import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface PayablesSummaryReadPort {
  /** Em cêntimos: total em aberto (pendentes + em atraso) e só em atraso. */
  summary(organizationId: OrganizationId): Promise<{ dueCents: number; overdueCents: number }>;
}
