export class InvalidAccountingDocumentTypeError extends Error {
  constructor(value: string) {
    super(`Tipo de documento inválido: "${value}"`);
    this.name = "InvalidAccountingDocumentTypeError";
  }
}

export class InvalidFundingSourceError extends Error {
  constructor(value: string) {
    super(`Origem dos fundos inválida: "${value}"`);
    this.name = "InvalidFundingSourceError";
  }
}

export class InvalidSettlementMethodError extends Error {
  constructor(value: string) {
    super(`Forma de tratamento inválida: "${value}"`);
    this.name = "InvalidSettlementMethodError";
  }
}

export class InvalidDeductiblePercentageError extends Error {
  constructor(value: number) {
    super(`Percentagem dedutível inválida: ${value} (tem de estar entre 0 e 100)`);
    this.name = "InvalidDeductiblePercentageError";
  }
}

/** Nunca a categoria decide sozinha quando o gestor diverge da sugestão — a task é explícita nisto. */
export class DeductibilityOverrideReasonRequiredError extends Error {
  constructor() {
    super("É obrigatório indicar o motivo quando a percentagem dedutível diverge da sugestão da subcategoria");
    this.name = "DeductibilityOverrideReasonRequiredError";
  }
}

export class CancellationReasonRequiredError extends Error {
  constructor() {
    super("É obrigatório indicar o motivo do cancelamento");
    this.name = "CancellationReasonRequiredError";
  }
}

export class AccountingDocumentNotFoundError extends Error {
  constructor(id: string) {
    super(`Documento "${id}" não encontrado`);
    this.name = "AccountingDocumentNotFoundError";
  }
}

/** Deteção de duplicados (secção 9 da task) — cruza Documentos e Faturas por NIF/número/data/total/tipo. */
export class PossibleDuplicateDocumentError extends Error {
  constructor(public readonly candidate: { source: "invoice" | "accounting_document"; id: string; label: string }) {
    super(`Possível documento duplicado: ${candidate.label}`);
    this.name = "PossibleDuplicateDocumentError";
  }
}

export class InvalidQuarterError extends Error {
  constructor(value: number) {
    super(`Trimestre inválido: ${value} (tem de ser 1, 2, 3 ou 4)`);
    this.name = "InvalidQuarterError";
  }
}

export class InvalidVatPeriodError extends Error {
  constructor(periodicity: string, period: number) {
    super(`Período de IVA inválido: ${period} para periodicidade "${periodicity}"`);
    this.name = "InvalidVatPeriodError";
  }
}

export class InvalidVatPeriodicityError extends Error {
  constructor(value: string) {
    super(`Periodicidade de IVA inválida: "${value}" (tem de ser "monthly" ou "quarterly")`);
    this.name = "InvalidVatPeriodicityError";
  }
}
