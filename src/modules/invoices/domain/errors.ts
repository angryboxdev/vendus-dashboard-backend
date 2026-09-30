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
