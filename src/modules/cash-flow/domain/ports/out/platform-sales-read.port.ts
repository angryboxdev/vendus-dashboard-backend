import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { SalesFigures } from "../../entities/dre.js";

export interface PlatformSalesReadPort {
  /** Vendas das plataformas de entrega (AirMenu) entre `from` e `to`; zeros se indisponível. */
  sales(organizationId: OrganizationId, from: string, to: string): Promise<SalesFigures>;
}
