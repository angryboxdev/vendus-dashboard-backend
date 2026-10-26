import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Colaborador visto pelas recorrências: só o que é preciso para o associar a uma recorrência de salários. */
export interface RecurrenceEmployee {
  id: string;
  fullName: string;
  status: "active" | "inactive";
}

/**
 * Cross-módulo: leitura mínima da ficha partilhada `hr_employees` (fica sempre —
 * ADR-0040). Declarado aqui, como os outros ports cross-módulo (D2); nunca escreve.
 */
export interface EmployeeDirectoryReadPort {
  findById(organizationId: OrganizationId, id: string): Promise<RecurrenceEmployee | null>;
  /** Todos (ativos e inativos), ordenados por nome. */
  findAll(organizationId: OrganizationId): Promise<RecurrenceEmployee[]>;
}
