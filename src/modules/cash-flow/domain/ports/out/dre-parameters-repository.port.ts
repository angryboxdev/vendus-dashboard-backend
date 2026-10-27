import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DreParameters } from "../../entities/dre-parameters.js";

export interface DreParametersRepositoryPort {
  /** Parâmetros gravados para o mês (`own`) e os do último mês anterior com valores (`previous`). */
  forMonth(organizationId: OrganizationId, year: number, month: number): Promise<{ own: DreParameters | null; previous: DreParameters | null }>;
  /** Grava (cria ou substitui) os parâmetros do mês. */
  save(organizationId: OrganizationId, year: number, month: number, parameters: DreParameters, updatedBy: string | null): Promise<void>;
}
