import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DreEntries } from "../../entities/dre.js";

/** Os pagamentos por trás de cada rubrica da DRE do mês (para conferir a classificação). */
export interface GetDreEntriesPort {
  execute(params: { organizationId: OrganizationId; year: number; month: number }): Promise<DreEntries>;
}
