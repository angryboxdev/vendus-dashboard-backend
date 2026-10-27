import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface InvoicesToReviewReadPort {
  /** Número de faturas importadas ainda por rever/confirmar. */
  count(organizationId: OrganizationId): Promise<number>;
}
