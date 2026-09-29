import {
  CancellationReasonRequiredError,
  DeductibilityOverrideReasonRequiredError,
  InvalidAccountingDocumentTypeError,
  InvalidDeductiblePercentageError,
  InvalidFundingSourceError,
  InvalidSettlementMethodError,
} from "../errors.js";

export type AccountingDocumentType =
  | "partner_invoice"
  | "employee_invoice"
  | "platform_commission"
  | "credit_note"
  | "manual"
  | "regularization"
  | "other";

export const ACCOUNTING_DOCUMENT_TYPES: AccountingDocumentType[] = [
  "partner_invoice",
  "employee_invoice",
  "platform_commission",
  "credit_note",
  "manual",
  "regularization",
  "other",
];

/**
 * "Origem dos fundos" — deliberadamente não inclui banco/cartão/caixa da
 * empresa: esse fluxo é sempre uma Fatura normal (módulo `invoices`), nunca
 * um AccountingDocument.
 */
export type AccountingFundingSource = "partner" | "employee" | "platform" | "other";

export const ACCOUNTING_FUNDING_SOURCES: AccountingFundingSource[] = [
  "partner",
  "employee",
  "platform",
  "other",
];

export type AccountingSettlementMethod = "reimbursement" | "partner_current_account" | "other";

export const ACCOUNTING_SETTLEMENT_METHODS: AccountingSettlementMethod[] = [
  "reimbursement",
  "partner_current_account",
  "other",
];

export type AccountingDocumentStatus =
  | "pending_review"
  | "validated"
  | "with_pendency"
  | "closed"
  | "cancelled";

export interface AccountingDocumentProps {
  id: string;
  organizationId: string;
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
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAccountingDocumentProps {
  organizationId: string;
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
  vatDeductibleAmount: number;
  vatNonDeductibleAmount: number;
  settlementMethod: string;
  notes?: string | null;
  createdBy: string;
}

export interface UpdateAccountingDocumentData {
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
  vatDeductibleAmount?: number;
  vatNonDeductibleAmount?: number;
  settlementMethod?: string;
  notes?: string | null;
}

function assertValidDocumentType(value: string): asserts value is AccountingDocumentType {
  if (!ACCOUNTING_DOCUMENT_TYPES.includes(value as AccountingDocumentType)) {
    throw new InvalidAccountingDocumentTypeError(value);
  }
}

function assertValidFundingSource(value: string): asserts value is AccountingFundingSource {
  if (!ACCOUNTING_FUNDING_SOURCES.includes(value as AccountingFundingSource)) {
    throw new InvalidFundingSourceError(value);
  }
}

function assertValidSettlementMethod(value: string): asserts value is AccountingSettlementMethod {
  if (!ACCOUNTING_SETTLEMENT_METHODS.includes(value as AccountingSettlementMethod)) {
    throw new InvalidSettlementMethodError(value);
  }
}

/**
 * A subcategoria só sugere (`cost_center_categories.vat_deductible`); nunca
 * decide sozinha. `deductiblePercentage` só é gravado quando o gestor
 * diverge explicitamente dessa sugestão — e nesse caso o motivo é
 * obrigatório (espelha a constraint de BD `..._override_requires_reason`).
 */
function assertValidDeductibilityOverride(
  deductiblePercentage: number | null,
  deductibilityOverrideReason: string | null,
): void {
  if (deductiblePercentage === null) {
    return;
  }
  if (deductiblePercentage < 0 || deductiblePercentage > 100) {
    throw new InvalidDeductiblePercentageError(deductiblePercentage);
  }
  if (!deductibilityOverrideReason || deductibilityOverrideReason.trim().length === 0) {
    throw new DeductibilityOverrideReasonRequiredError();
  }
}

export class AccountingDocument {
  private constructor(private readonly props: AccountingDocumentProps) {}

  static create(props: CreateAccountingDocumentProps): AccountingDocument {
    assertValidDocumentType(props.documentType);
    assertValidFundingSource(props.fundingSource);
    assertValidSettlementMethod(props.settlementMethod);
    const deductiblePercentage = props.deductiblePercentage ?? null;
    const deductibilityOverrideReason = props.deductibilityOverrideReason ?? null;
    assertValidDeductibilityOverride(deductiblePercentage, deductibilityOverrideReason);

    const now = new Date();
    return new AccountingDocument({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      documentType: props.documentType,
      fundingSource: props.fundingSource,
      entityName: props.entityName.trim(),
      nif: props.nif?.trim() || null,
      documentNumber: props.documentNumber?.trim() || null,
      issueDate: props.issueDate,
      receivedDate: props.receivedDate ?? null,
      competenceDate: props.competenceDate ?? null,
      currency: props.currency ?? "EUR",
      country: props.country ?? "PT",
      subtotalWithoutVat: props.subtotalWithoutVat,
      vatAmount: props.vatAmount,
      totalWithVat: props.totalWithVat,
      costCenterCategoryId: props.costCenterCategoryId ?? null,
      deductiblePercentage,
      deductibilityOverrideReason,
      vatDeductibleAmount: props.vatDeductibleAmount,
      vatNonDeductibleAmount: props.vatNonDeductibleAmount,
      settlementMethod: props.settlementMethod,
      status: "pending_review",
      cancellationReason: null,
      notes: props.notes ?? null,
      createdBy: props.createdBy,
      updatedBy: props.createdBy,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: AccountingDocumentProps): AccountingDocument {
    return new AccountingDocument(props);
  }

  update(data: UpdateAccountingDocumentData, updatedBy: string): AccountingDocument {
    const documentType = data.documentType ?? this.props.documentType;
    const fundingSource = data.fundingSource ?? this.props.fundingSource;
    const settlementMethod = data.settlementMethod ?? this.props.settlementMethod;
    assertValidDocumentType(documentType);
    assertValidFundingSource(fundingSource);
    assertValidSettlementMethod(settlementMethod);

    const deductiblePercentage =
      data.deductiblePercentage !== undefined ? data.deductiblePercentage : this.props.deductiblePercentage;
    const deductibilityOverrideReason =
      data.deductibilityOverrideReason !== undefined
        ? data.deductibilityOverrideReason
        : this.props.deductibilityOverrideReason;
    assertValidDeductibilityOverride(deductiblePercentage, deductibilityOverrideReason);

    return new AccountingDocument({
      ...this.props,
      documentType,
      fundingSource,
      settlementMethod,
      entityName: data.entityName !== undefined ? data.entityName.trim() : this.props.entityName,
      nif: data.nif !== undefined ? data.nif?.trim() || null : this.props.nif,
      documentNumber:
        data.documentNumber !== undefined ? data.documentNumber?.trim() || null : this.props.documentNumber,
      issueDate: data.issueDate ?? this.props.issueDate,
      receivedDate: data.receivedDate !== undefined ? data.receivedDate : this.props.receivedDate,
      competenceDate: data.competenceDate !== undefined ? data.competenceDate : this.props.competenceDate,
      currency: data.currency ?? this.props.currency,
      country: data.country ?? this.props.country,
      subtotalWithoutVat: data.subtotalWithoutVat ?? this.props.subtotalWithoutVat,
      vatAmount: data.vatAmount ?? this.props.vatAmount,
      totalWithVat: data.totalWithVat ?? this.props.totalWithVat,
      costCenterCategoryId:
        data.costCenterCategoryId !== undefined ? data.costCenterCategoryId : this.props.costCenterCategoryId,
      deductiblePercentage,
      deductibilityOverrideReason,
      vatDeductibleAmount: data.vatDeductibleAmount ?? this.props.vatDeductibleAmount,
      vatNonDeductibleAmount: data.vatNonDeductibleAmount ?? this.props.vatNonDeductibleAmount,
      notes: data.notes !== undefined ? data.notes : this.props.notes,
      updatedBy,
      updatedAt: new Date(),
    });
  }

  validate(actor: string): AccountingDocument {
    return new AccountingDocument({
      ...this.props,
      status: "validated",
      updatedBy: actor,
      updatedAt: new Date(),
    });
  }

  markWithPendency(actor: string): AccountingDocument {
    return new AccountingDocument({
      ...this.props,
      status: "with_pendency",
      updatedBy: actor,
      updatedAt: new Date(),
    });
  }

  cancel(reason: string, actor: string): AccountingDocument {
    if (!reason || reason.trim().length === 0) {
      throw new CancellationReasonRequiredError();
    }
    return new AccountingDocument({
      ...this.props,
      status: "cancelled",
      cancellationReason: reason.trim(),
      updatedBy: actor,
      updatedAt: new Date(),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get status(): AccountingDocumentStatus {
    return this.props.status;
  }

  get documentType(): AccountingDocumentType {
    return this.props.documentType;
  }

  get nif(): string | null {
    return this.props.nif;
  }

  get documentNumber(): string | null {
    return this.props.documentNumber;
  }

  get issueDate(): string {
    return this.props.issueDate;
  }

  get totalWithVat(): number {
    return this.props.totalWithVat;
  }

  toProps(): AccountingDocumentProps {
    return { ...this.props };
  }
}
