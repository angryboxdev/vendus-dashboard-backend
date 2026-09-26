import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Employee, EmploymentType } from "../../entities/employee.js";

export interface EmployeeFilter {
  search?: string;
  status?: "active" | "inactive" | "all";
  employmentType?: EmploymentType;
}

export interface EmployeeRepositoryPort {
  findById(organizationId: OrganizationId, id: string): Promise<Employee | null>;
  /**
   * Lê até um limite alto (mesma abordagem já usada pela listagem legacy —
   * ver README) e devolve o total real filtrado; a paginação/filtro por
   * situação documental do use case são aplicados em memória sobre este
   * conjunto.
   */
  findMany(organizationId: OrganizationId, filter: EmployeeFilter): Promise<Employee[]>;
  create(organizationId: OrganizationId, employee: Employee): Promise<Employee>;
  update(organizationId: OrganizationId, employee: Employee): Promise<Employee>;
}
