import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** O que os documentos de colaborador precisam de saber do colaborador (ficha em `hr_employees`). */
export interface DocumentEmployee {
  id: string;
  fullName: string;
  nif: string | null;
  /** Cargo — decide as categorias aplicáveis. */
  positionId: string | null;
}

/**
 * Leitura mínima dos colaboradores para os documentos (ADR-0040, fase 1):
 * substitui o `EmployeeRepositoryPort` do RH antigo. Nunca escreve na ficha.
 */
export interface EmployeeDirectoryPort {
  findById(organizationId: OrganizationId, id: string): Promise<DocumentEmployee | null>;
  /** Ordenados por nome. */
  findMany(organizationId: OrganizationId, filter: { status: "active" | "all" }): Promise<DocumentEmployee[]>;
  /** Colaborador ligado à conta de acesso (Portal; `hr_employees.user_id`), ou null. */
  findLinkedEmployeeId(organizationId: OrganizationId, userId: string): Promise<string | null>;
}
