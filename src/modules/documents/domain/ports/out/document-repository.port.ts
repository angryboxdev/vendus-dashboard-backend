import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Document, DocumentOwnerType } from "../../entities/document.js";

export interface DocumentRepositoryPort {
  findById(organizationId: OrganizationId, id: string): Promise<Document | null>;
  /** Só as versões atuais (`is_current = true`) dos donos indicados (um ou vários). */
  findCurrentByOwners(organizationId: OrganizationId, ownerType: DocumentOwnerType, ownerIds: string[]): Promise<Document[]>;
  /** Toda a cadeia de versões (atuais e antigas) de uma categoria de um dono, mais recente primeiro. */
  findVersionHistory(
    organizationId: OrganizationId,
    ownerType: DocumentOwnerType,
    ownerId: string,
    category: string,
  ): Promise<Document[]>;
  create(organizationId: OrganizationId, document: Document): Promise<Document>;
  update(organizationId: OrganizationId, document: Document): Promise<Document>;
}
