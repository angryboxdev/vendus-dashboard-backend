import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type {
  AccountingDocumentStatus,
  AccountingDocumentType,
  AccountingFundingSource,
  AccountingSettlementMethod,
} from "../../entities/accounting-document.js";
import type { AccountingDocumentAttachmentDTO } from "../out/accounting-document-attachment-repository.port.js";

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface AccountingDocumentDTO {
  id: string;
  documentType: AccountingDocumentType;
  fundingSource: AccountingFundingSource;
  entityName: string;
  nif: string | null;
  documentNumber: string | null;
  issueDate: string;
  receivedDate: string | null;
  competenceDate: string | null;
  currency: string;
  country: string;
  subtotalWithoutVat: number;
  vatAmount: number;
  totalWithVat: number;
  costCenterCategoryId: string | null;
  deductiblePercentage: number | null;
  deductibilityOverrideReason: string | null;
  vatDeductibleAmount: number;
  vatNonDeductibleAmount: number;
  settlementMethod: AccountingSettlementMethod;
  status: AccountingDocumentStatus;
  cancellationReason: string | null;
  notes: string | null;
  attachments: AccountingDocumentAttachmentDTO[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Commands ──────────────────────────────────────────────────────────────

export interface CreateAccountingDocumentCommand {
  organizationId: OrganizationId;
  documentType: string;
  fundingSource: string;
  entityName: string;
  nif?: string | null;
  documentNumber?: string | null;
  issueDate: string;
  receivedDate?: string | null;
  competenceDate?: string | null;
  currency?: string;
  country?: string;
  subtotalWithoutVat: number;
  vatAmount: number;
  totalWithVat: number;
  costCenterCategoryId?: string | null;
  deductiblePercentage?: number | null;
  deductibilityOverrideReason?: string | null;
  settlementMethod: string;
  notes?: string | null;
  actor: string;
  /** Confirma a criação mesmo perante um possível duplicado já identificado. */
  confirmDuplicate?: boolean;
}

export interface UpdateAccountingDocumentCommand {
  organizationId: OrganizationId;
  id: string;
  data: {
    documentType?: string;
    fundingSource?: string;
    entityName?: string;
    nif?: string | null;
    documentNumber?: string | null;
    issueDate?: string;
    receivedDate?: string | null;
    competenceDate?: string | null;
    currency?: string;
    country?: string;
    subtotalWithoutVat?: number;
    vatAmount?: number;
    totalWithVat?: number;
    costCenterCategoryId?: string | null;
    deductiblePercentage?: number | null;
    deductibilityOverrideReason?: string | null;
    settlementMethod?: string;
    notes?: string | null;
  };
  actor: string;
  confirmDuplicate?: boolean;
}

export interface GetAccountingDocumentCommand {
  organizationId: OrganizationId;
  id: string;
}

export interface ValidateAccountingDocumentCommand {
  organizationId: OrganizationId;
  id: string;
  actor: string;
}

export interface MarkAccountingDocumentPendencyCommand {
  organizationId: OrganizationId;
  id: string;
  actor: string;
}

export interface CancelAccountingDocumentCommand {
  organizationId: OrganizationId;
  id: string;
  reason: string;
  actor: string;
}

export interface UploadAccountingDocumentAttachmentCommand {
  organizationId: OrganizationId;
  id: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  actor: string;
}

// ── Input ports ───────────────────────────────────────────────────────────

export interface CreateAccountingDocumentPort {
  execute(command: CreateAccountingDocumentCommand): Promise<AccountingDocumentDTO>;
}

export interface UpdateAccountingDocumentPort {
  execute(command: UpdateAccountingDocumentCommand): Promise<AccountingDocumentDTO>;
}

export interface GetAccountingDocumentPort {
  execute(command: GetAccountingDocumentCommand): Promise<AccountingDocumentDTO>;
}

export interface ValidateAccountingDocumentPort {
  execute(command: ValidateAccountingDocumentCommand): Promise<AccountingDocumentDTO>;
}

export interface MarkAccountingDocumentPendencyPort {
  execute(command: MarkAccountingDocumentPendencyCommand): Promise<AccountingDocumentDTO>;
}

export interface CancelAccountingDocumentPort {
  execute(command: CancelAccountingDocumentCommand): Promise<AccountingDocumentDTO>;
}

export interface UploadAccountingDocumentAttachmentPort {
  execute(command: UploadAccountingDocumentAttachmentCommand): Promise<AccountingDocumentDTO>;
}
