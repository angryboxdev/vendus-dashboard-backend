import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { OverviewAbsence, OverviewDay, PendingCounts } from "../../entities/overview.js";

/** Tudo o que o painel lê dos outros módulos do Novo RH (ligado no server.ts). */
export interface OverviewSourcesPort {
  /** Data de hoje no fuso da organização. */
  today(org: OrganizationId): Promise<string>;
  /** Colaboradores ativos, com o centro principal. */
  employees(org: OrganizationId): Promise<{ id: string; name: string; locationId: string | null }[]>;
  locations(org: OrganizationId): Promise<{ id: string; name: string }[]>;
  /** Dias apurados pela assiduidade (planeado vs. real), sem gravar. */
  days(org: OrganizationId, employeeId: string, from: string, to: string): Promise<OverviewDay[]>;
  /** Ausências aprovadas que tocam o período (tipo privado → nome genérico se `canPrivate` = false). */
  absences(org: OrganizationId, from: string, to: string, canPrivate: boolean): Promise<OverviewAbsence[]>;
  pending(org: OrganizationId): Promise<PendingCounts>;
  /** Próximos feriados a partir da data (inclusive). */
  holidays(org: OrganizationId, from: string, limit: number): Promise<{ date: string; name: string }[]>;
}
