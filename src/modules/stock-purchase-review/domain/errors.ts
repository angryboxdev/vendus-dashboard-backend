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
