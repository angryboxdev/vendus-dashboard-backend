export class StockPurchaseReviewNotFoundError extends Error {
  constructor(id: string) {
    super(`Compra por rever "${id}" não encontrada`);
    this.name = "StockPurchaseReviewNotFoundError";
  }
}

export class InvalidReviewLineResolutionError extends Error {
  constructor(reason: string) {
    super(`Resolução de linha inválida: ${reason}`);
    this.name = "InvalidReviewLineResolutionError";
  }
}

export class InvalidConversionFactorError extends Error {
  constructor(value: unknown) {
    super(`Fator de conversão inválido: ${String(value)} (tem de ser um número positivo e finito)`);
    this.name = "InvalidConversionFactorError";
  }
}

export class InactiveStockItemReferencedError extends Error {
  constructor(stockItemId: string) {
    super(`O item de stock "${stockItemId}" está inativo — não pode ser usado nesta resolução`);
    this.name = "InactiveStockItemReferencedError";
  }
}

export class ReviewNotReadyError extends Error {
  constructor(reason: string) {
    super(`Revisão ainda não está pronta para confirmar: ${reason}`);
    this.name = "ReviewNotReadyError";
  }
}

export class StaleReviewVersionError extends Error {
  constructor(public readonly currentVersion: number) {
    super("Esta revisão foi alterada por outro utilizador — recarregue antes de tentar novamente");
    this.name = "StaleReviewVersionError";
  }
}

export class StaleInvoiceSnapshotError extends Error {
  constructor() {
    super("A fatura de origem foi alterada desde a criação desta revisão — é preciso revalidar antes de confirmar");
    this.name = "StaleInvoiceSnapshotError";
  }
}

export class ReviewAlreadyAppliedError extends Error {
  constructor(id: string) {
    super(`Compra por rever "${id}" já foi aplicada — não pode ser alterada nem cancelada`);
    this.name = "ReviewAlreadyAppliedError";
  }
}

export class ReviewAlreadyCancelledError extends Error {
  constructor(id: string) {
    super(`Compra por rever "${id}" já foi cancelada`);
    this.name = "ReviewAlreadyCancelledError";
  }
}

export class CancellationReasonRequiredError extends Error {
  constructor() {
    super("É obrigatório indicar o motivo do cancelamento");
    this.name = "CancellationReasonRequiredError";
  }
}

/** Mais que uma loja ativa e a linha não tem loja própria (custo da organização inteira) — exige escolha explícita no confirm. */
export class LocationRequiredError extends Error {
  constructor() {
    super("Há mais que uma loja ativa — é preciso indicar a loja para esta linha antes de confirmar");
    this.name = "LocationRequiredError";
  }
}

/** F3a: as linhas não batem com a base/IVA da fatura — diferença de base ou IVA impede movimentar. */
/** A fatura conta numa unidade (ex.: kg) e a conversão da linha dá menos do que uma dessa unidade (1 g em vez de 1000 g). */
export class SuspiciousConversionError extends Error {
  constructor(
    public readonly lineDescription: string,
    public readonly conversionFactor: number,
    public readonly expectedFactor: number,
    invoiceUnit: string,
    baseUnit: string,
  ) {
    super(
      `«${lineDescription}»: a fatura conta em ${invoiceUnit} mas a conversão está 1 ${invoiceUnit} = ${conversionFactor} ${baseUnit} (deve ser pelo menos ${expectedFactor} ${baseUnit}) — corrigir a conversão/embalagem da linha antes de confirmar`,
    );
    this.name = "SuspiciousConversionError";
  }
}

export class DocumentNotReconciledError extends Error {
  constructor(
    public readonly netDifferenceCents: number,
    public readonly vatDifferenceCents: number,
  ) {
    super(
      `As linhas da revisão não batem com a fatura (base ${(netDifferenceCents / 100).toFixed(2)} €, IVA ${(vatDifferenceCents / 100).toFixed(2)} €) — corrigir a fatura no Financeiro antes de movimentar`,
    );
    this.name = "DocumentNotReconciledError";
  }
}

/** F3b: só uma revisão retirada (cancelada) pode ser reposta em Compras por rever. */
export class ReviewNotCancelledError extends Error {
  constructor(id: string) {
    super(`Compra por rever "${id}" não está retirada — não há nada a repor`);
    this.name = "ReviewNotCancelledError";
  }
}

/**
 * F3c: importada no Stock e ainda não lançada no Financeiro — só pode movimentar com a validação
 * documental mínima (identidade e linhas a bater com a fatura). Não é aprovação contabilística.
 */
export class StockImportNotValidatedError extends Error {
  constructor(reason: string) {
    super(`Ainda não lançada no Financeiro: para dar entrada no Stock antes disso, ${reason}`);
    this.name = "StockImportNotValidatedError";
  }
}

/** Apresentação de compra inválida (conteúdo, unidades, mínimo/incremento). */
export class InvalidPurchasePresentationError extends Error {
  constructor(reason: string) {
    super(`Embalagem de compra inválida: ${reason}`);
    this.name = "InvalidPurchasePresentationError";
  }
}

/** Regras de entrada no Stock inválidas (tipo de artigo ou modo). */
export class InvalidEntryRulesError extends Error {
  constructor(reason: string) {
    super(`Regras de entrada no Stock inválidas: ${reason}`);
    this.name = "InvalidEntryRulesError";
  }
}
