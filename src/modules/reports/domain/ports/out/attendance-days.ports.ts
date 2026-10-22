import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { BoardDay, ExportTable } from "../../entities/attendance-days.js";

export interface ReportPerson {
  id: string;
  name: string;
  locationId: string | null;
  hireDate: string | null;
  status: "active" | "inactive";
  deactivatedAt: string | null;
}

/** Fontes do relatório de assiduidade (ligadas no composition root). */
export interface AttendanceDaysSourcesPort {
  people(org: OrganizationId): Promise<ReportPerson[]>;
  /** Grupos e departamentos de cada colaborador num dia (pertenças com vigência). */
  units(org: OrganizationId, date: string): Promise<Map<string, { groups: string[]; departments: string[] }>>;
  /** Dias apurados pelo motor de ponto, em lote (no máximo 31 dias). */
  daysMany(org: OrganizationId, employeeIds: string[], from: string, to: string): Promise<Map<string, BoardDay[]>>;
}

/** Escreve uma tabela num ficheiro Excel (.xlsx). */
export interface TableWriterPort {
  xlsx(table: ExportTable): Buffer;
}
