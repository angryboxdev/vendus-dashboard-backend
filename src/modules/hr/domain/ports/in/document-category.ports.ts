import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { JobRole } from "../../entities/employee.js";

export interface DocumentCategoryDTO {
  id: string;
  slug: string;
  label: string;
  mandatory: boolean;
  jobRoles: JobRole[];
  acceptedMimeTypes: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Listar ────────────────────────────────────────────────────────────────

export interface ListDocumentCategoriesCommand {
  organizationId: OrganizationId;
}

export interface ListDocumentCategoriesPort {
  execute(command: ListDocumentCategoriesCommand): Promise<DocumentCategoryDTO[]>;
}

// ── Criar ─────────────────────────────────────────────────────────────────

export interface CreateDocumentCategoryCommand {
  organizationId: OrganizationId;
  label: string;
  mandatory: boolean;
  jobRoles: JobRole[];
  acceptedMimeTypes: string[];
}

export interface CreateDocumentCategoryPort {
  execute(command: CreateDocumentCategoryCommand): Promise<DocumentCategoryDTO>;
}

// ── Editar ────────────────────────────────────────────────────────────────

export interface UpdateDocumentCategoryCommand {
  organizationId: OrganizationId;
  id: string;
  label?: string;
  mandatory?: boolean;
  jobRoles?: JobRole[];
  acceptedMimeTypes?: string[];
}

export interface UpdateDocumentCategoryPort {
  execute(command: UpdateDocumentCategoryCommand): Promise<DocumentCategoryDTO>;
}

// ── Ativar/desativar ──────────────────────────────────────────────────────

export interface SetDocumentCategoryActiveCommand {
  organizationId: OrganizationId;
  id: string;
  active: boolean;
}

export interface SetDocumentCategoryActivePort {
  execute(command: SetDocumentCategoryActiveCommand): Promise<DocumentCategoryDTO>;
}
