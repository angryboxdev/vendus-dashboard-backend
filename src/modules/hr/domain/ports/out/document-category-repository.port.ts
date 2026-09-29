import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DocumentCategoryDefinition } from "../../entities/document-category.js";

export interface DocumentCategoryRepositoryPort {
  findMany(organizationId: OrganizationId, opts?: { activeOnly?: boolean }): Promise<DocumentCategoryDefinition[]>;
  findById(organizationId: OrganizationId, id: string): Promise<DocumentCategoryDefinition | null>;
  findBySlug(organizationId: OrganizationId, slug: string): Promise<DocumentCategoryDefinition | null>;
  create(organizationId: OrganizationId, definition: DocumentCategoryDefinition): Promise<DocumentCategoryDefinition>;
  update(organizationId: OrganizationId, definition: DocumentCategoryDefinition): Promise<DocumentCategoryDefinition>;
}
