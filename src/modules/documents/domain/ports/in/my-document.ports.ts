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
  /** Categoria (slug) — o Portal agrupa por ela em pastas (campo aditivo, 2026-10-23). */
  category: string;
  fileName: string;
  /** Tipo do ficheiro (pré-visualização no Portal); `null` em documentos antigos. */
  mimeType: string | null;
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

/** Categoria para onde o colaborador pode enviar, com o estado do documento atual (`null` nas periódicas). */
export interface MySubmittableCategoryDTO {
  slug: string;
  label: string;
  mandatory: boolean;
  /** Periódica (ex.: recibo verde): cada envio é de um mês. */
  requiresPeriod: boolean;
  /** Tipos aceites (subconjunto de PDF/JPG/PNG). */
  accepts: string[];
  status: "missing" | "ok" | "expiring" | "expired" | "pending" | null;
  /** Pode enviar agora (em falta, vencido/a vencer, ou periódica). */
  canSubmit: boolean;
  lastRejection: { note: string; at: string } | null;
}
export interface MyDocumentChecklistDTO {
  categories: MySubmittableCategoryDTO[];
  /** Obrigatórios em falta ou vencidos (em validação não conta). */
  missingMandatory: { id: string; label: string; categories: string[]; status: "missing" | "expired" }[];
}
export interface GetMyDocumentChecklistPort {
  execute(identity: PortalIdentity): Promise<MyDocumentChecklistDTO>;
}
export interface SubmitMyDocumentCommand extends PortalIdentity {
  category: string;
  /** `YYYY-MM` nas categorias periódicas. */
  period?: string | null;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  expiresAt?: string | null;
}
export interface SubmitMyDocumentPort {
  execute(command: SubmitMyDocumentCommand): Promise<MyDocumentDTO>;
}
