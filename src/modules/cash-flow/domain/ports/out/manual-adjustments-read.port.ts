import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ManualAdjustments } from "../../entities/dre.js";

export interface ManualAdjustmentsReadPort {
  /** Custos fixos e variáveis lançados à mão no Mapa para o mês (sem IVA, cêntimos). */
  forMonth(organizationId: OrganizationId, year: number, month: number): Promise<ManualAdjustments>;
}
