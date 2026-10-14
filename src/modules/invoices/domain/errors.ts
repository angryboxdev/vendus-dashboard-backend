export class InvoiceNotFoundError extends Error {
  constructor(id: string) {
    super(`Invoice not found: ${id}`);
    this.name = "InvoiceNotFoundError";
  }
}

export class InvoiceLineNotFoundError extends Error {
  constructor(id: string) {
    super(`Invoice line not found: ${id}`);
    this.name = "InvoiceLineNotFoundError";
  }
}

export class InvoiceAlreadyCancelledError extends Error {
  constructor(id: string) {
    super(`Invoice is already cancelled: ${id}`);
    this.name = "InvoiceAlreadyCancelledError";
  }
}

export class DuplicateInvoiceError extends Error {
  constructor(invoiceNumber: string, supplierName: string) {
    super(`Já existe uma fatura "${invoiceNumber}" para o fornecedor "${supplierName}"`);
    this.name = "DuplicateInvoiceError";
  }
}

export class ChannelRequiredError extends Error {
  constructor(categoryId: string) {
    super(`Canal obrigatório para a subcategoria: ${categoryId}`);
    this.name = "ChannelRequiredError";
  }
}

export class LineDetailModeError extends Error {
  constructor(invoiceId: string) {
    super(`A fatura ${invoiceId} está em modo simples. Ative o modo detalhado antes de adicionar linhas.`);
    this.name = "LineDetailModeError";
  }
}

export class LinesTotalMismatchError extends Error {
  constructor(invoiceId: string) {
    super(`A soma das linhas da fatura ${invoiceId} não coincide com os totais do cabeçalho (tolerância: 0,01 EUR).`);
    this.name = "LinesTotalMismatchError";
  }
}

export class InvoiceAlreadyReconciledError extends Error {
  constructor(id: string) {
    super(`A fatura ${id} já está conciliada.`);
    this.name = "InvoiceAlreadyReconciledError";
  }
}

export class InvoiceNotPaidError extends Error {
  constructor(id: string) {
    super(`A fatura ${id} ainda não foi paga. Só é possível conciliar faturas pagas.`);
    this.name = "InvoiceNotPaidError";
  }
}

/**
 * Override de dedutibilidade de IVA por linha (módulo Contabilidade) — a
 * subcategoria só sugere; um override explícito (0-100) exige sempre motivo.
 */
export class InvalidDeductibilityOverrideError extends Error {
  constructor(reason: "range" | "reason_required", percentage: number) {
    super(
      reason === "range"
        ? `Percentagem dedutível inválida: ${percentage} (tem de estar entre 0 e 100)`
        : "É obrigatório indicar o motivo quando a percentagem dedutível diverge da sugestão da subcategoria",
    );
    this.name = "InvalidDeductibilityOverrideError";
  }
}

/**
 * Módulo Stock (Compra por rever, D10) — a fatura já foi incluída no stock
 * (a revisão associada tem movimentos reais aplicados); editar o impacto em
 * stock ou descartar as linhas detalhadas ficaria inconsistente com esses
 * movimentos. Bloqueia sempre, nunca aceita confirmação.
 */
export class InvoiceLinesLockedByAppliedStockReviewError extends Error {
  constructor(invoiceId: string) {
    super(
      `Esta fatura (${invoiceId}) já foi incluída no stock. Remova ou anule a entrada de stock (em "Compras por rever") antes de fazer esta alteração.`,
    );
    this.name = "InvoiceLinesLockedByAppliedStockReviewError";
  }
}

/**
 * Módulo Stock (Compra por rever, D10) — a fatura tem uma revisão associada
 * ainda não aplicada; a alteração pedida (mudar `stockReviewOverride` ou
 * descartar linhas detalhadas) removeria essa revisão. Nunca bloqueia nem
 * descarta silenciosamente — exige confirmação explícita do utilizador
 * (`confirmRemoveStockReview: true`) antes de prosseguir.
 */
export class StockReviewRemovalConfirmationRequiredError extends Error {
  constructor(invoiceId: string) {
    super(
      `A fatura (${invoiceId}) tem uma revisão de stock associada ainda não aplicada. Confirmar para remover essa revisão e continuar?`,
    );
    this.name = "StockReviewRemovalConfirmationRequiredError";
  }
}

/**
 * Identidade fiscal (task v1.2 §1.2): o documento já existe, só no Stock, é
 * um possível duplicado ou não tem identidade completa. O ecrã usa `code`
 * para oferecer a ação certa (abrir original, completar, comparar, corrigir).
 */
export class FiscalIdentityConflictError extends Error {
  constructor(
    readonly code: "existing_finance" | "existing_stock_only" | "possible_duplicate" | "identity_incomplete",
    message: string,
    readonly details: { existingInvoiceId?: string | null; identityId?: string; candidates?: { invoiceId: string | null; seriesNumber: string }[]; missing?: string[] } = {},
  ) {
    super(message);
    this.name = "FiscalIdentityConflictError";
  }
}

/** A conta a pagar já tem pagamento: total/vencimento não mudam em silêncio (corrigir por NC/ajuste). */
export class InvoicePayableSettledError extends Error {
  constructor(id: string) {
    super(`A conta a pagar da fatura ${id} já foi paga. Corrija o valor por nota de crédito ou ajuste, não alterando o total.`);
    this.name = "InvoicePayableSettledError";
  }
}

/** Valores não reconciliados ao cêntimo (task v1.2 §1.3): a fatura fica em rascunho, não finaliza. */
export class InvoiceAmountsNotReconciledError extends Error {
  constructor(
    readonly description: string,
    readonly details: { differenceCents: number | null; issues: { code: string }[]; computed: { netCents: number; vatCents: number; totalCents: number } },
  ) {
    super(`Os valores não batem com a fatura: ${description}. Pode guardar como rascunho e corrigir.`);
    this.name = "InvoiceAmountsNotReconciledError";
  }
}

/** Outra pessoa alterou a fatura entretanto (bloqueio otimista, F1 §1.4). */
export class InvoiceVersionConflictError extends Error {
  constructor(id: string, readonly currentVersion: number | null) {
    super(`A fatura ${id} foi alterada entretanto por outra pessoa. Recarregue e volte a aplicar a alteração.`);
    this.name = "InvoiceVersionConflictError";
  }
}

/** «Enviar para Stock» precisa de decisão explícita (política «Decidir») ou de motivo (contraria a predefinição). */
export class StockDecisionRequiredError extends Error {
  constructor(
    readonly code: "decision_required" | "reason_required",
    message: string,
  ) {
    super(message);
    this.name = "StockDecisionRequiredError";
  }
}

/** «Por valores»: alocações que não somam a base líquida ou com subcategoria inválida (F2 §2.2). */
export class AllocationsNotReconciledError extends Error {
  constructor(
    readonly description: string,
    readonly details: { remainingCents: number; issues: { code: string }[] },
  ) {
    super(`Repartição «Por valores» por conferir: ${description}.`);
    this.name = "AllocationsNotReconciledError";
  }
}

/** «Guardar rascunho» só se aplica a rascunhos (importados por rever). */
export class InvoiceNotDraftError extends Error {
  constructor(id: string) {
    super(`A fatura ${id} já foi lançada — use a edição normal.`);
    this.name = "InvoiceNotDraftError";
  }
}
