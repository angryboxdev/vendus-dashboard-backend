import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface Employee {
  id: string;
  fullName: string;
}

export interface EmployeeRepositoryPort {
  /**
   * Procura um funcionário activo pelo hash do PIN, dentro da organização.
   * Escopado (spec B2 ticket 03): antes procurava em todos os funcionários da
   * base de dados. O risco de colisão de PIN entre organizações permanece o
   * item diferido de spec A — não é resolvido aqui.
   */
  findActiveByPinHash(organizationId: OrganizationId, pinHash: string): Promise<Employee | null>;
  /** Procura um funcionário activo pelo ID, dentro da organização. */
  findActiveById(organizationId: OrganizationId, id: string): Promise<Employee | null>;
}
