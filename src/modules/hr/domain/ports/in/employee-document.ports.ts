import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DocumentOrigin } from "../../entities/employee-document.js";
import type { DocumentDisplayStatus } from "../../services/document-status.service.js";

export interface EmployeeDocumentDTO {
  id: string;
  employeeId: string;
  category: string;
  mandatory: boolean;
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  origin: DocumentOrigin;
  expiresAt: string | null;
  version: number;
  previousVersionId: string | null;
  displayStatus: DocumentDisplayStatus;
  uploadedBy: string;
  uploadedAt: string;
}

// ── Listar ────────────────────────────────────────────────────────────────

export interface ListEmployeeDocumentsCommand {
  organizationId: OrganizationId;
  employeeId: string;
}

export interface ListEmployeeDocumentsPort {
  execute(command: ListEmployeeDocumentsCommand): Promise<EmployeeDocumentDTO[]>;
}

// ── Upload de nova categoria ──────────────────────────────────────────────

export interface UploadEmployeeDocumentCommand {
  organizationId: OrganizationId;
  actor: string;
  employeeId: string;
  category: string;
  mandatory: boolean;
  origin: DocumentOrigin;
  expiresAt: string | null;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface UploadEmployeeDocumentPort {
  execute(command: UploadEmployeeDocumentCommand): Promise<EmployeeDocumentDTO>;
}

// ── Substituir (nova versão) ──────────────────────────────────────────────

export interface ReplaceEmployeeDocumentCommand {
  organizationId: OrganizationId;
  actor: string;
  employeeId: string;
  documentId: string;
  expiresAt?: string | null;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface ReplaceEmployeeDocumentPort {
  execute(command: ReplaceEmployeeDocumentCommand): Promise<EmployeeDocumentDTO>;
}

// ── Remover (lógico) ──────────────────────────────────────────────────────

export interface RemoveEmployeeDocumentCommand {
  organizationId: OrganizationId;
  actor: string;
  employeeId: string;
  documentId: string;
}

export interface RemoveEmployeeDocumentPort {
  execute(command: RemoveEmployeeDocumentCommand): Promise<void>;
}

// ── URL de download ───────────────────────────────────────────────────────

export interface GetEmployeeDocumentDownloadUrlCommand {
  organizationId: OrganizationId;
  employeeId: string;
  documentId: string;
}

export interface GetEmployeeDocumentDownloadUrlPort {
  execute(command: GetEmployeeDocumentDownloadUrlCommand): Promise<{ url: string }>;
}

// ── Histórico de versões de uma categoria ────────────────────────────────

export interface GetEmployeeDocumentHistoryCommand {
  organizationId: OrganizationId;
  employeeId: string;
  documentId: string;
}

export interface GetEmployeeDocumentHistoryPort {
  execute(command: GetEmployeeDocumentHistoryCommand): Promise<EmployeeDocumentDTO[]>;
}
