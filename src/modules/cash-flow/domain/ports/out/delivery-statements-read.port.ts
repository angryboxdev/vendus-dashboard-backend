import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DeliveryMonth } from "../../entities/dre.js";

/** Resultados das plataformas no mês pelos extratos importados (vazio sem extratos) e o SAF-T do AirMenu (null sem ele). */
export interface DeliveryStatementsReadPort {
  forMonth(organizationId: OrganizationId, year: number, month: number): Promise<DeliveryMonth>;
}
