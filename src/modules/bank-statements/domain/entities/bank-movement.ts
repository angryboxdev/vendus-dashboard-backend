export type MovementType = "debit" | "credit";

export type ReconciliationStatus =
  | "conciliado_com_fatura"
  | "conciliado_parcial"
  | "conciliado_sem_fatura"
  | "justificado"
  | "sugestao"
  | "pendente_de_documento"
  | "saida_nao_justificada"
  | "transferencia_interna"
  | "divergente"
  | "ignorado_com_motivo";

export type JustificationType =
  | "fatura"
  | "recibo_comprovativo"
  | "contrato_recorrencia"
  | "despesa_bancaria_automatica"
  | "transferencia_interna"
  | "emprestimo_financiamento"
  | "sem_justificativa";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type MatchedEntityType =
  | "invoice"
  | "payable_entry"
  | "recurrence_occurrence"
  | "receipt"
  | "internal_transfer"
  | "manual_entry";

export const RESOLVED_STATUSES: ReadonlySet<ReconciliationStatus> = new Set([
  "conciliado_com_fatura",
  "conciliado_sem_fatura",
  "justificado",
  "transferencia_interna",
  "ignorado_com_motivo",
]);

/** Maps a justification type to the resulting reconciliation status. */
function justificationToStatus(jt: JustificationType): ReconciliationStatus {
  switch (jt) {
    case "fatura":
      return "conciliado_com_fatura";
    case "transferencia_interna":
      return "transferencia_interna";
    case "sem_justificativa":
      return "saida_nao_justificada";
    case "recibo_comprovativo":
    case "contrato_recorrencia":
    case "despesa_bancaria_automatica":
    case "emprestimo_financiamento":
      return "justificado";
  }
}

/** Returns true if the justification type requires a document. */
function requiresDocumentForJustification(jt: JustificationType): boolean {
  return jt === "fatura" || jt === "recibo_comprovativo";
}

/**
 * Computes the initial risk level for a debit movement based on amount.
 * Credits are always low risk.
 */
export function computeInitialRisk(amountCents: number, type: MovementType): RiskLevel {
  if (type === "credit") return "low";
  if (amountCents >= 500_000) return "critical"; // >= 5 000 €
  if (amountCents >= 50_000) return "high"; // >= 500 €
  if (amountCents >= 5_000) return "medium"; // >= 50 €
  return "low";
}

interface BankMovementProps {
  id: string;
  bankAccountId: string | null;
  statementImportId: string;
  bookingDate: Date;
  valueDate: Date;
  description: string;
  amount: number; // cents, absolute value
  balanceAfter: number; // cents
  currency: string;
  movementType: MovementType;
  reconciliationStatus: ReconciliationStatus;
  justificationType: JustificationType | null;
  riskLevel: RiskLevel;
  requiresDocument: boolean;
  documentUrl: string | null;
  matchedEntityType: MatchedEntityType | null;
  matchedEntityId: string | null;
  confidenceScore: number | null; // 0–1
  notes: string | null;
  deduplicationHash: string;
  createdAt: Date;
  updatedAt: Date;
  // Classification metadata
  costCenterGroupId: string | null;
  costCenterCategoryId: string | null;
  supplierId: string | null;
  vatRate: number | null;       // percentage e.g. 23 — null = not applicable
  vatIncluded: boolean | null;  // true = amount includes VAT — null = not applicable
  // Multi-entity reconciliation
  reconciliationAmountDiff: number | null; // cents: movement.amount - sum(entity_links.amount). null = not applicable
  /** Regra («movimento recorrente») que classificou o movimento automaticamente; null = classificação manual ou nenhuma. */
  classifiedByRuleId?: string | null;
}

export class BankMovement {
  readonly id: string;
  readonly bankAccountId: string | null;
  readonly statementImportId: string;
  readonly bookingDate: Date;
  readonly valueDate: Date;
  readonly description: string;
  readonly amount: number;
  readonly balanceAfter: number;
  readonly currency: string;
  readonly movementType: MovementType;
  readonly reconciliationStatus: ReconciliationStatus;
  readonly justificationType: JustificationType | null;
  readonly riskLevel: RiskLevel;
  readonly requiresDocument: boolean;
  readonly documentUrl: string | null;
  readonly matchedEntityType: MatchedEntityType | null;
  readonly matchedEntityId: string | null;
  readonly confidenceScore: number | null;
  readonly notes: string | null;
  readonly deduplicationHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly costCenterGroupId: string | null;
  readonly costCenterCategoryId: string | null;
  readonly supplierId: string | null;
  readonly vatRate: number | null;
  readonly vatIncluded: boolean | null;
  readonly reconciliationAmountDiff: number | null;
  readonly classifiedByRuleId: string | null;

  /** Tolerance for considering a multi-entity reconciliation as fully matched (1€). */
  static readonly PARTIAL_TOLERANCE_CENTS = 100;

  private constructor(props: BankMovementProps) {
    this.id = props.id;
    this.bankAccountId = props.bankAccountId;
    this.statementImportId = props.statementImportId;
    this.bookingDate = props.bookingDate;
    this.valueDate = props.valueDate;
    this.description = props.description;
    this.amount = props.amount;
    this.balanceAfter = props.balanceAfter;
    this.currency = props.currency;
    this.movementType = props.movementType;
    this.reconciliationStatus = props.reconciliationStatus;
    this.justificationType = props.justificationType;
    this.riskLevel = props.riskLevel;
    this.requiresDocument = props.requiresDocument;
    this.documentUrl = props.documentUrl;
    this.matchedEntityType = props.matchedEntityType;
    this.matchedEntityId = props.matchedEntityId;
    this.confidenceScore = props.confidenceScore;
    this.notes = props.notes;
    this.deduplicationHash = props.deduplicationHash;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.costCenterGroupId = props.costCenterGroupId;
    this.costCenterCategoryId = props.costCenterCategoryId;
    this.supplierId = props.supplierId;
    this.vatRate = props.vatRate;
    this.vatIncluded = props.vatIncluded;
    this.reconciliationAmountDiff = props.reconciliationAmountDiff;
    this.classifiedByRuleId = props.classifiedByRuleId ?? null;
  }

  get isResolved(): boolean {
    return RESOLVED_STATUSES.has(this.reconciliationStatus);
  }

  /**
   * true enquanto ninguém mexeu no movimento: débito por justificar ou crédito aceite automaticamente,
   * sem justificação nem regra. Só estes recebem regras — nunca se sobrepõe uma classificação manual,
   * uma conciliação com fatura, uma sugestão ou um «sem justificativa» escolhido pelo utilizador.
   */
  get isUntouched(): boolean {
    if (this.justificationType !== null || this.classifiedByRuleId !== null || this.matchedEntityType !== null) return false;
    return this.movementType === "debit"
      ? this.reconciliationStatus === "saida_nao_justificada"
      : this.reconciliationStatus === "conciliado_sem_fatura";
  }

  /**
   * Factory for a newly imported movement.
   * Debits start as "saida_nao_justificada"; credits are auto-resolved as "conciliado_sem_fatura".
   */
  static create(props: {
    bankAccountId?: string | null;
    statementImportId: string;
    bookingDate: Date;
    valueDate: Date;
    description: string;
    amount: number;
    balanceAfter: number;
    currency?: string;
    movementType: MovementType;
    deduplicationHash: string;
  }): BankMovement {
    if (props.amount < 0) throw new Error("Movement amount must be non-negative (use movementType for direction)");
    if (!props.description.trim()) throw new Error("Movement description is required");

    const initialStatus: ReconciliationStatus =
      props.movementType === "debit" ? "saida_nao_justificada" : "conciliado_sem_fatura";

    const now = new Date();
    return new BankMovement({
      id: crypto.randomUUID(),
      bankAccountId: props.bankAccountId ?? null,
      statementImportId: props.statementImportId,
      bookingDate: props.bookingDate,
      valueDate: props.valueDate,
      description: props.description.trim(),
      amount: props.amount,
      balanceAfter: props.balanceAfter,
      currency: props.currency ?? "EUR",
      movementType: props.movementType,
      reconciliationStatus: initialStatus,
      justificationType: null,
      riskLevel: computeInitialRisk(props.amount, props.movementType),
      requiresDocument: false,
      documentUrl: null,
      matchedEntityType: null,
      matchedEntityId: null,
      confidenceScore: null,
      notes: null,
      deduplicationHash: props.deduplicationHash,
      createdAt: now,
      updatedAt: now,
      costCenterGroupId: null,
      costCenterCategoryId: null,
      supplierId: null,
      vatRate: null,
      vatIncluded: null,
      reconciliationAmountDiff: null,
    });
  }

  static reconstitute(props: BankMovementProps): BankMovement {
    return new BankMovement(props);
  }

  /**
   * Classifies the movement with a justification type (manual or by rule).
   */
  classify(opts: {
    justificationType: JustificationType;
    matchedEntityType?: MatchedEntityType;
    matchedEntityId?: string;
    riskLevel?: RiskLevel;
    notes?: string;
    documentUrl?: string;
    costCenterGroupId?: string;
    costCenterCategoryId?: string;
    supplierId?: string;
    vatRate?: number;
    vatIncluded?: boolean;
  }): BankMovement {
    return new BankMovement({
      ...this.toProps(),
      reconciliationStatus: justificationToStatus(opts.justificationType),
      justificationType: opts.justificationType,
      matchedEntityType: opts.matchedEntityType ?? this.matchedEntityType,
      matchedEntityId: opts.matchedEntityId ?? this.matchedEntityId,
      riskLevel: opts.riskLevel ?? "low",
      requiresDocument: requiresDocumentForJustification(opts.justificationType),
      documentUrl: opts.documentUrl ?? this.documentUrl,
      notes: opts.notes ?? this.notes,
      confidenceScore: null,
      updatedAt: new Date(),
      costCenterGroupId: opts.costCenterGroupId ?? this.costCenterGroupId,
      costCenterCategoryId: opts.costCenterCategoryId ?? this.costCenterCategoryId,
      supplierId: opts.supplierId ?? this.supplierId,
      vatRate: opts.vatRate ?? this.vatRate,
      vatIncluded: opts.vatIncluded ?? this.vatIncluded,
      classifiedByRuleId: null,
    });
  }

  /** Tem categoria (centro de custo) — conta na rubrica certa da DRE, conciliado ou não. */
  get hasClassification(): boolean {
    return this.costCenterCategoryId !== null || this.costCenterGroupId !== null;
  }

  /**
   * Só classifica (decisão do utilizador, 2026-10-29): categoria, fornecedor e IVA para a DRE, sem conciliar —
   * fica «Classificado · aguarda fatura» (`pendente_de_documento`, não conta como conciliado) até ser
   * ligado ao documento. Tira qualquer justificação ou ligação anterior.
   */
  classifyOnly(opts: {
    costCenterGroupId: string | null;
    costCenterCategoryId: string | null;
    supplierId?: string | null;
    vatRate?: number | null;
    vatIncluded?: boolean | null;
    notes?: string;
  }): BankMovement {
    return new BankMovement({
      ...this.toProps(),
      reconciliationStatus: "pendente_de_documento",
      justificationType: null,
      matchedEntityType: null,
      matchedEntityId: null,
      requiresDocument: true,
      confidenceScore: null,
      reconciliationAmountDiff: null,
      costCenterGroupId: opts.costCenterGroupId,
      costCenterCategoryId: opts.costCenterCategoryId,
      supplierId: opts.supplierId === undefined ? this.supplierId : opts.supplierId,
      vatRate: opts.vatRate === undefined ? this.vatRate : opts.vatRate,
      vatIncluded: opts.vatIncluded === undefined ? this.vatIncluded : opts.vatIncluded,
      notes: opts.notes ?? this.notes,
      classifiedByRuleId: null,
      updatedAt: new Date(),
    });
  }

  /** Remove a classificação e a conciliação: volta a «por justificar» (saída) ou aceite (entrada), sem categoria. */
  clearClassification(): BankMovement {
    return new BankMovement({
      ...this.unreconcile().toProps(),
      reconciliationStatus: this.movementType === "debit" ? "saida_nao_justificada" : "conciliado_sem_fatura",
      requiresDocument: false,
      costCenterGroupId: null,
      costCenterCategoryId: null,
      supplierId: null,
      vatRate: null,
      vatIncluded: null,
    });
  }

  /** Classificação automática por um «movimento recorrente» (regra); fica registada a regra para se poder anular. */
  classifyByRule(rule: {
    id: string;
    /** A regra só classifica: o movimento fica à espera da fatura. */
    classifyOnly?: boolean;
    justificationType: JustificationType;
    riskLevel: RiskLevel;
    costCenterGroupId: string | null;
    costCenterCategoryId: string | null;
    supplierId: string | null;
    vatRate: number | null;
    vatIncluded: boolean | null;
  }, occurrenceId?: string): BankMovement {
    if (rule.classifyOnly) {
      const only = this.classifyOnly({
        costCenterGroupId: rule.costCenterGroupId,
        costCenterCategoryId: rule.costCenterCategoryId,
        supplierId: rule.supplierId,
        vatRate: rule.vatRate,
        vatIncluded: rule.vatIncluded,
      });
      return new BankMovement({ ...only.toProps(), riskLevel: rule.riskLevel, classifiedByRuleId: rule.id });
    }
    const classified = this.classify({
      justificationType: rule.justificationType,
      riskLevel: rule.riskLevel,
      ...(occurrenceId !== undefined && { matchedEntityType: "recurrence_occurrence" as const, matchedEntityId: occurrenceId }),
      ...(rule.costCenterGroupId !== null && { costCenterGroupId: rule.costCenterGroupId }),
      ...(rule.costCenterCategoryId !== null && { costCenterCategoryId: rule.costCenterCategoryId }),
      ...(rule.supplierId !== null && { supplierId: rule.supplierId }),
      ...(rule.vatRate !== null && { vatRate: rule.vatRate }),
      ...(rule.vatIncluded !== null && { vatIncluded: rule.vatIncluded }),
    });
    return new BankMovement({ ...classified.toProps(), classifiedByRuleId: rule.id });
  }

  /** A regra deixou de existir: a classificação mantém-se, só se perde a ligação. */
  detachRule(): BankMovement {
    return new BankMovement({ ...this.toProps(), classifiedByRuleId: null });
  }

  /**
   * Marks the movement as a system suggestion pending user confirmation.
   */
  markAsSuggestion(
    entityType: MatchedEntityType,
    entityId: string,
    confidence: number
  ): BankMovement {
    return new BankMovement({
      ...this.toProps(),
      reconciliationStatus: "sugestao",
      matchedEntityType: entityType,
      matchedEntityId: entityId,
      confidenceScore: Math.min(1, Math.max(0, confidence)),
      updatedAt: new Date(),
    });
  }

  /**
   * Reconciles the movement against one or more entities.
   * @param amountDiff movement.amount - sum(entity amounts). Positive = excess, negative = shortfall.
   */
  multiReconcile(amountDiff: number): BankMovement {
    const isPartial = Math.abs(amountDiff) > BankMovement.PARTIAL_TOLERANCE_CENTS;
    return new BankMovement({
      ...this.toProps(),
      // Valem a categoria e o IVA real dos documentos (decisão do utilizador): a classificação própria sai,
      // senão a DRE continuaria a usá-la antes da fatura.
      costCenterGroupId: null,
      costCenterCategoryId: null,
      supplierId: null,
      vatRate: null,
      vatIncluded: null,
      reconciliationStatus: isPartial ? "conciliado_parcial" : "conciliado_com_fatura",
      justificationType: "fatura",
      matchedEntityType: null,
      matchedEntityId: null,
      riskLevel: "low",
      requiresDocument: true,
      confidenceScore: null,
      reconciliationAmountDiff: isPartial ? amountDiff : null,
      classifiedByRuleId: null,
      updatedAt: new Date(),
    });
  }

  /**
   * Ignores the movement with a mandatory reason.
   */
  ignore(reason: string): BankMovement {
    if (!reason.trim()) throw new Error("A reason is required to ignore a movement");
    return new BankMovement({
      ...this.toProps(),
      reconciliationStatus: "ignorado_com_motivo",
      justificationType: null,
      riskLevel: "low",
      requiresDocument: false,
      notes: reason.trim(),
      classifiedByRuleId: null,
      updatedAt: new Date(),
    });
  }

  /**
   * Cancels the reconciliation, resetting the movement to its default unclassified state.
   */
  unreconcile(): BankMovement {
    // Uma saída classificada à mão volta a «Classificado · aguarda fatura» (a DRE não perde a rubrica); a
    // classificação de uma regra sai toda (o movimento fica intocado e a regra pode voltar a aplicar-se).
    const byRule = this.classifiedByRuleId !== null;
    const classified = this.movementType === "debit" && this.hasClassification && !byRule;
    const resetStatus: ReconciliationStatus = classified
      ? "pendente_de_documento"
      : this.movementType === "debit"
        ? "saida_nao_justificada"
        : "conciliado_sem_fatura";
    return new BankMovement({
      ...this.toProps(),
      reconciliationStatus: resetStatus,
      justificationType: null,
      matchedEntityType: null,
      matchedEntityId: null,
      requiresDocument: classified,
      ...(byRule && { costCenterGroupId: null, costCenterCategoryId: null, supplierId: null, vatRate: null, vatIncluded: null }),
      confidenceScore: null,
      reconciliationAmountDiff: null,
      classifiedByRuleId: null,
      updatedAt: new Date(),
    });
  }

  private toProps(): BankMovementProps {
    return {
      id: this.id,
      bankAccountId: this.bankAccountId,
      statementImportId: this.statementImportId,
      bookingDate: this.bookingDate,
      valueDate: this.valueDate,
      description: this.description,
      amount: this.amount,
      balanceAfter: this.balanceAfter,
      currency: this.currency,
      movementType: this.movementType,
      reconciliationStatus: this.reconciliationStatus,
      justificationType: this.justificationType,
      riskLevel: this.riskLevel,
      requiresDocument: this.requiresDocument,
      documentUrl: this.documentUrl,
      matchedEntityType: this.matchedEntityType,
      matchedEntityId: this.matchedEntityId,
      confidenceScore: this.confidenceScore,
      notes: this.notes,
      deduplicationHash: this.deduplicationHash,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      costCenterGroupId: this.costCenterGroupId,
      costCenterCategoryId: this.costCenterCategoryId,
      supplierId: this.supplierId,
      vatRate: this.vatRate,
      vatIncluded: this.vatIncluded,
      reconciliationAmountDiff: this.reconciliationAmountDiff,
      classifiedByRuleId: this.classifiedByRuleId,
    };
  }
}
