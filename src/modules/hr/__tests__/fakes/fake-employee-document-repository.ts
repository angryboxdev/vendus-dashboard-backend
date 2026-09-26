import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { EmployeeDocument } from "../../domain/entities/employee-document.js";
import type { EmployeeDocumentRepositoryPort } from "../../domain/ports/out/employee-document-repository.port.js";

export class FakeEmployeeDocumentRepository implements EmployeeDocumentRepositoryPort {
  private readonly byOrg = new Map<string, Map<string, EmployeeDocument>>();

  private store(organizationId: OrganizationId): Map<string, EmployeeDocument> {
    const key = String(organizationId);
    if (!this.byOrg.has(key)) this.byOrg.set(key, new Map());
    return this.byOrg.get(key)!;
  }

  seed(organizationId: OrganizationId, document: EmployeeDocument): void {
    this.store(organizationId).set(document.id, document);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<EmployeeDocument | null> {
    return this.store(organizationId).get(id) ?? null;
  }

  async findCurrentByEmployeeId(organizationId: OrganizationId, employeeId: string): Promise<EmployeeDocument[]> {
    return [...this.store(organizationId).values()].filter((d) => d.employeeId === employeeId && d.isCurrent);
  }

  async findCurrentByEmployeeIds(organizationId: OrganizationId, employeeIds: string[]): Promise<EmployeeDocument[]> {
    return [...this.store(organizationId).values()].filter(
      (d) => employeeIds.includes(d.employeeId) && d.isCurrent,
    );
  }

  async findVersionHistory(
    organizationId: OrganizationId,
    employeeId: string,
    category: string,
  ): Promise<EmployeeDocument[]> {
    return [...this.store(organizationId).values()]
      .filter((d) => d.employeeId === employeeId && d.category === category)
      .sort((a, b) => b.version - a.version);
  }

  async create(organizationId: OrganizationId, document: EmployeeDocument): Promise<EmployeeDocument> {
    this.store(organizationId).set(document.id, document);
    return document;
  }

  async update(organizationId: OrganizationId, document: EmployeeDocument): Promise<EmployeeDocument> {
    this.store(organizationId).set(document.id, document);
    return document;
  }
}
