import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { BaseScheduleTemplate } from "../../entities/base-schedule-template.js";

export interface BaseScheduleRepositoryPort {
  findByEmployee(organizationId: OrganizationId, employeeId: string): Promise<BaseScheduleTemplate[]>;
  /** Todas as células de todos os colaboradores — usado para calcular "Falta de cobertura" sobre uma semana inteira. */
  findAll(organizationId: OrganizationId): Promise<BaseScheduleTemplate[]>;
  /** Cria ou substitui a célula (org, employeeId, weekday) — no máximo uma por combinação. */
  upsert(organizationId: OrganizationId, template: BaseScheduleTemplate): Promise<BaseScheduleTemplate>;
}
