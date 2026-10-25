import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Orçamento diário de IA da organização (partilhado com o leitor de faturas, tabela `ai_usage_daily`). */
export interface StockAiBudgetPort {
  consume(organizationId: OrganizationId, feature: "stock_match"): Promise<{ allowed: boolean }>;
}
