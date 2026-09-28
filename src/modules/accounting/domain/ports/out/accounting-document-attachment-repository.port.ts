import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface AccountingDocumentAttachmentDTO {
  id: string;
  documentId: string;
  storagePath: string;
  fileType: string;
  fileHash: string;
  version: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface AddAccountingDocumentAttachmentData {
  documentId: string;
  storagePath: string;
  fileType: string;
  fileHash: string;
  uploadedBy: string;
}

/**
 * Anexo versionado (secção 16 da task) — cada upload é uma linha nova; nunca
 * substitui nem apaga uma versão anterior ("documento original" nunca se
 * perde silenciosamente).
 */
export interface AccountingDocumentAttachmentRepositoryPort {
  add(organizationId: OrganizationId, data: AddAccountingDocumentAttachmentData): Promise<AccountingDocumentAttachmentDTO>;
  listByDocument(organizationId: OrganizationId, documentId: string): Promise<AccountingDocumentAttachmentDTO[]>;
}
