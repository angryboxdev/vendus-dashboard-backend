import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DocumentVisibility } from "../../entities/document.js";
import type { DocumentDisplayStatus } from "../../services/document-validity.service.js";

/** Papel de quem consulta/escreve — decide que documentos da Empresa vê (D11). */
export type DocumentViewerRole = "admin" | "manager" | "hr_viewer";

export interface CompanyDocumentDTO {
  id: string;
  category: string;
  categoryLabel: string;
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  issuedAt: string | null;
  expiresAt: string | null;
  visibility: DocumentVisibility;
  displayStatus: DocumentDisplayStatus;
  version: number;
  /** `false` = versão "Substituída" (só no histórico). */
  isCurrent: boolean;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ListCompanyDocumentsQuery {
  organizationId: OrganizationId;
  viewerRole: DocumentViewerRole;
}

/** Versões atuais visíveis para o papel de quem consulta. */
export interface ListCompanyDocumentsPort {
  execute(query: ListCompanyDocumentsQuery): Promise<CompanyDocumentDTO[]>;
}

export interface UploadCompanyDocumentCommand {
  organizationId: OrganizationId;
  actor: string;
  viewerRole: DocumentViewerRole;
  category: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  issuedAt: string | null;
  expiresAt: string | null;
  visibility: DocumentVisibility;
}

/** Primeira versão de uma categoria — se já houver versão atual, exige "Substituir". */
export interface UploadCompanyDocumentPort {
  execute(command: UploadCompanyDocumentCommand): Promise<CompanyDocumentDTO>;
}

export interface ReplaceCompanyDocumentCommand {
  organizationId: OrganizationId;
  actor: string;
  viewerRole: DocumentViewerRole;
  documentId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  issuedAt: string | null;
  expiresAt: string | null;
  /** Omitido = mantém a visibilidade da versão anterior. */
  visibility?: DocumentVisibility;
}

/** Renovação: nova versão "Atual", a anterior fica "Substituída" — nunca apagada. */
export interface ReplaceCompanyDocumentPort {
  execute(command: ReplaceCompanyDocumentCommand): Promise<CompanyDocumentDTO>;
}

export interface RemoveCompanyDocumentCommand {
  organizationId: OrganizationId;
  actor: string;
  viewerRole: DocumentViewerRole;
  documentId: string;
}

/** Remoção lógica — o ficheiro e a linha ficam para auditoria. */
export interface RemoveCompanyDocumentPort {
  execute(command: RemoveCompanyDocumentCommand): Promise<void>;
}

export interface CompanyDocumentQuery {
  organizationId: OrganizationId;
  viewerRole: DocumentViewerRole;
  documentId: string;
}

export interface GetCompanyDocumentDownloadUrlPort {
  execute(query: CompanyDocumentQuery): Promise<{ url: string }>;
}

/** Todas as versões (atual + substituídas) da categoria do documento indicado, mais recente primeiro. */
export interface GetCompanyDocumentHistoryPort {
  execute(query: CompanyDocumentQuery): Promise<CompanyDocumentDTO[]>;
}
