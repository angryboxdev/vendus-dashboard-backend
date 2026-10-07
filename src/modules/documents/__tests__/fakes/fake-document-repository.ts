import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Document, DocumentOwnerType } from "../../domain/entities/document.js";
import type { DocumentRepositoryPort } from "../../domain/ports/out/document-repository.port.js";

export class FakeDocumentRepository implements DocumentRepositoryPort {
  private readonly byOrg = new Map<string, Map<string, Document>>();

  private store(organizationId: OrganizationId): Map<string, Document> {
    const key = String(organizationId);
    if (!this.byOrg.has(key)) this.byOrg.set(key, new Map());
    return this.byOrg.get(key)!;
  }

  seed(organizationId: OrganizationId, document: Document): void {
    this.store(organizationId).set(document.id, document);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<Document | null> {
    return this.store(organizationId).get(id) ?? null;
  }

  async findCurrentByOwners(organizationId: OrganizationId, ownerType: DocumentOwnerType, ownerIds: string[]): Promise<Document[]> {
    return [...this.store(organizationId).values()].filter(
      (d) => d.ownerType === ownerType && ownerIds.includes(d.ownerId) && d.isCurrent,
    );
  }

  async findVersionHistory(
    organizationId: OrganizationId,
    ownerType: DocumentOwnerType,
    ownerId: string,
    category: string,
  ): Promise<Document[]> {
    return [...this.store(organizationId).values()]
      .filter((d) => d.ownerType === ownerType && d.ownerId === ownerId && d.category === category)
      .sort((a, b) => b.version - a.version);
  }

  async findPendingValidation(organizationId: OrganizationId): Promise<Document[]> {
    return [...this.store(organizationId).values()].filter((d) => d.ownerType === "employee" && d.status === "pending_validation" && d.isCurrent);
  }

  async create(organizationId: OrganizationId, document: Document): Promise<Document> {
    this.store(organizationId).set(document.id, document);
    return document;
  }

  async update(organizationId: OrganizationId, document: Document): Promise<Document> {
    this.store(organizationId).set(document.id, document);
    return document;
  }
}
