import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { EmployeeDocument } from "../../entities/employee-document.js";

export interface EmployeeDocumentRepositoryPort {
  findById(organizationId: OrganizationId, id: string): Promise<EmployeeDocument | null>;
  /** Só as versões atuais (`is_current = true`) de um colaborador. */
  findCurrentByEmployeeId(organizationId: OrganizationId, employeeId: string): Promise<EmployeeDocument[]>;
  /** Só as versões atuais, para vários colaboradores de uma vez (lista/KPIs). */
  findCurrentByEmployeeIds(organizationId: OrganizationId, employeeIds: string[]): Promise<EmployeeDocument[]>;
  /** Toda a cadeia de versões (atuais e antigas) de uma categoria de um colaborador, mais recente primeiro. */
  findVersionHistory(
    organizationId: OrganizationId,
    employeeId: string,
    category: string,
  ): Promise<EmployeeDocument[]>;
  create(organizationId: OrganizationId, document: EmployeeDocument): Promise<EmployeeDocument>;
  update(organizationId: OrganizationId, document: EmployeeDocument): Promise<EmployeeDocument>;
}
