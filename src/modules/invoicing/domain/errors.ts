/** Violação de uma regra fiscal (dados recusados antes de emitir). A F3 mapeia para 422. */
export class InvoicingRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoicingRuleError";
  }
}

/** Outro documento entrou na série entretanto: recomeçar a partir do estado novo. */
export class StaleSeriesError extends Error {
  constructor(seriesRef: string) {
    super(`A série ${seriesRef} mudou entretanto`);
    this.name = "StaleSeriesError";
  }
}

export class InvoicingNotFoundError extends Error {
  constructor(what: string) {
    super(`${what} não encontrado`);
    this.name = "InvoicingNotFoundError";
  }
}

/** Avisos que exigem confirmação expressa antes de emitir (Despacho 3.4.2 e 3.4.3). */
export class IssueNeedsConfirmationError extends Error {
  constructor(readonly warnings: string[]) {
    super(`Confirmação necessária: ${warnings.join(", ")}`);
    this.name = "IssueNeedsConfirmationError";
  }
}

/** A emissão não está disponível (ex.: chave de assinatura não configurada). */
export class InvoicingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoicingUnavailableError";
  }
}
