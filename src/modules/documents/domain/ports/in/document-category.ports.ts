import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DocumentCategoryScope, OperationalCategory } from "../../entities/document-category.js";

export interface DocumentCategoryDTO {
  id: string;
  slug: string;
  label: string;
  mandatory: boolean;
  jobRoles: OperationalCategory[];
  acceptedMimeTypes: string[];
  scope: DocumentCategoryScope;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Listar ────────────────────────────────────────────────────────────────

export interface ListDocumentCategoriesCommand {
  organizationId: OrganizationId;
  /** Só as categorias aplicáveis a este dono (`both` conta para os dois). Omitido = todas. */
  ownerType?: "employee" | "company";
}

export interface ListDocumentCategoriesPort {
  execute(command: ListDocumentCategoriesCommand): Promise<DocumentCategoryDTO[]>;
}

// ── Criar ─────────────────────────────────────────────────────────────────

export interface CreateDocumentCategoryCommand {
  organizationId: OrganizationId;
  label: string;
  mandatory: boolean;
  jobRoles: OperationalCategory[];
  acceptedMimeTypes: string[];
  /** Omissão: `employee`. */
  scope?: DocumentCategoryScope;
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
  jobRoles?: OperationalCategory[];
  acceptedMimeTypes?: string[];
  scope?: DocumentCategoryScope;
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
