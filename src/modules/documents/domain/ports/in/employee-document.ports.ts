import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DocumentOrigin } from "../../entities/document.js";
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
  /** `YYYY-MM` nas categorias periódicas (ex: Recibo de vencimento); `null` nas restantes. */
  period: string | null;
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
  /** Obrigatório (`YYYY-MM`) se a categoria for periódica; proibido nas restantes. */
  period?: string | null;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  /** Preenchido pela importação em massa de recibos: liga as entradas do histórico do mesmo lote. */
  importBatchId?: string;
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
  /** Ver `UploadEmployeeDocumentCommand.importBatchId`. */
  importBatchId?: string;
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

// ── Visão agregada (aba "Pessoas > Documentos") ──────────────────────────

export interface DocumentOverviewRowDTO {
  employeeId: string;
  employeeName: string;
  /** "identificacao" (grupo fixo) ou o slug da categoria configurável. */
  requirementId: string;
  requirementLabel: string;
  mandatory: boolean;
  status: "ok" | "expiring" | "expired" | "missing";
  expiresAt: string | null;
  documentId: string | null;
  /** `YYYY-MM` nas linhas de categorias periódicas (uma por documento atual); `null` nas restantes. */
  period: string | null;
}

export interface GetDocumentOverviewCommand {
  organizationId: OrganizationId;
}

/** 1 linha por (colaborador ativo × requisito documental aplicável ao seu cargo) — única fonte de verdade da aba "Pessoas > Documentos" (task "Melhorar Visão Geral e reorganizar Pessoas"). */
export interface GetDocumentOverviewPort {
  execute(command: GetDocumentOverviewCommand): Promise<DocumentOverviewRowDTO[]>;
}

// ── Envios do colaborador (Portal, ticket 11) ─────────────────────────────

export interface ReviewEmployeeDocumentCommand {
  organizationId: OrganizationId;
  actor: string;
  employeeId: string;
  documentId: string;
  decision: "approve" | "reject";
  /** Obrigatório ao rejeitar — o colaborador vê-o no Portal. */
  note?: string;
  /** Ao validar, o RH pode confirmar/corrigir a validade. */
  expiresAt?: string | null;
}
export interface ReviewEmployeeDocumentPort {
  execute(command: ReviewEmployeeDocumentCommand): Promise<EmployeeDocumentDTO>;
}

export interface PendingDocumentDTO {
  id: string;
  employeeId: string;
  employeeName: string;
  categoryLabel: string;
  fileName: string;
  expiresAt: string | null;
  submittedAt: string;
}
export interface ListPendingDocumentsPort {
  execute(command: { organizationId: OrganizationId }): Promise<PendingDocumentDTO[]>;
}

// ── Resumo documental do colaborador (ficha do Novo RH) ───────────────────

/** O mesmo cálculo que o perfil do RH antigo fazia (`GetEmployeeProfile`), só a parte documental. */
export interface EmployeeDocumentSummaryDTO {
  employeeId: string;
  /** Cargo — o frontend filtra as categorias aplicáveis com ele. */
  positionId: string | null;
  mandatoryTotal: number;
  mandatoryCompleted: number;
  missingRequirements: string[];
  missingOptional: string[];
  expiringSoonCount: number;
  /** Só alertas documentais (a expirar, em falta). Vazio para inativos. */
  alerts: Array<{ type: "document_expiring" | "document_missing"; message: string }>;
}

export interface GetEmployeeDocumentSummaryPort {
  execute(command: { organizationId: OrganizationId; employeeId: string }): Promise<EmployeeDocumentSummaryDTO>;
}
