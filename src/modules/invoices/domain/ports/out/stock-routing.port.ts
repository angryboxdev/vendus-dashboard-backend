import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Sugestão de «Enviar para Stock» (F2 v1.2 §2.1), vinda do módulo de Stock. */
export interface StockRoutingView {
  send: boolean | null;
  source: "supplier_location" | "supplier" | "category" | "none";
  reason: string;
  requiresDecision: boolean;
}

export interface StockRoutingPort {
  suggest(organizationId: OrganizationId, input: { supplierId: string | null; locationId: string | null; categoryIds: string[] }): Promise<StockRoutingView>;
}
