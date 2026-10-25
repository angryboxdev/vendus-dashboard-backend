import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export type AiFeature = "invoice_extraction" | "line_classification" | "stock_match";

/**
 * Orçamento diário de IA por organização: cada chamada à IA pede autorização primeiro. `allowed:
 * false` = limite do dia atingido (a chamada não é feita nem contada).
 */
export interface AiBudgetPort {
  consume(organizationId: OrganizationId, feature: AiFeature): Promise<{ allowed: boolean; used: number; limit: number }>;
}
