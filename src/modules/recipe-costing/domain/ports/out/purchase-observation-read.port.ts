import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PurchaseObservation } from "../../entities/price-history.js";

/** Compras confirmadas para o Stock (revisões aplicadas) de um artigo, com o desconto da linha. */
export interface PurchaseObservationReadPort {
  /** `null` quando o artigo não existe nesta empresa. */
  findItem(organizationId: OrganizationId, stockItemId: string): Promise<{ id: string; name: string; baseUnit: string } | null>;
  listForItem(organizationId: OrganizationId, stockItemId: string): Promise<PurchaseObservation[]>;
}
