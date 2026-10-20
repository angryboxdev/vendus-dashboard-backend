import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Quem pede no Portal: a conta autenticada. O colaborador é sempre resolvido a partir dela. */
export interface PortalIdentity {
  organizationId: OrganizationId;
  userId: string;
  actor: string;
}

export interface MyDocumentDTO {
  id: string;
  categoryLabel: string;
  fileName: string;
  /** "valid" ou "pending_validation" (enviado pelo colaborador, aguarda o RH). */
  status: string;
  /** Vencido/a vencer em 30 dias e sem envio pendente → botão "Substituir". */
  canReplace: boolean;
  /** Último envio do colaborador rejeitado pelo RH (motivo), se for o mais recente. */
  lastRejection: { note: string; at: string } | null;
  /** `YYYY-MM` nos recibos. */
  period: string | null;
  isPayslip: boolean;
  issuedAt: string | null;
  expiresAt: string | null;
  uploadedAt: string;
}

export interface ListMyDocumentsPort {
  execute(identity: PortalIdentity): Promise<MyDocumentDTO[]>;
}
export interface GetMyDocumentUrlPort {
  execute(identity: PortalIdentity, documentId: string): Promise<{ url: string }>;
}

export interface ReplaceMyDocumentCommand extends PortalIdentity {
  documentId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  /** Nova data de validade indicada pelo colaborador (o RH confirma ao validar). */
  expiresAt?: string | null;
}
export interface ReplaceMyDocumentPort {
  execute(command: ReplaceMyDocumentCommand): Promise<MyDocumentDTO>;
}
