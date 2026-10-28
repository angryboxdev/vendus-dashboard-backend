import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DeliveryStatementResult } from "../../entities/dre.js";

/** Resultados das plataformas no mês pelos extratos importados; vazio sem extratos. */
export interface DeliveryStatementsReadPort {
  forMonth(organizationId: OrganizationId, year: number, month: number): Promise<DeliveryStatementResult[]>;
}
