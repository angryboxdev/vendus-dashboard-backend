import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DreReport } from "../../entities/dre.js";

/** DRE do mês a partir da conciliação bancária (Mapa de rentabilidade). */
export interface GetDrePort {
  execute(params: { organizationId: OrganizationId; year: number; month: number }): Promise<DreReport>;
}
