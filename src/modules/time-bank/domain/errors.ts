/** Erros do Novo RH → Banco de horas. O controller converte-os em RFC 7807. */

export class TimeBankValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "TimeBankValidationError";
  }
}

/** 422: regra do banco impede (RE-28: compensar mais do que o saldo; limite anual pago). */
export class TimeBankRuleError extends Error {
  constructor(
    message: string,
    readonly code: "exceeds_balance" | "paid_limit" | "not_visible",
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "TimeBankRuleError";
  }
}

export class TimeBankConflictError extends Error {
  constructor(
    message: string,
    readonly code: "duplicate_name" | "already_decided" | "not_required",
  ) {
    super(message);
    this.name = "TimeBankConflictError";
  }
}

export class TimeBankForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeBankForbiddenError";
  }
}

export class TimeBankNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeBankNotFoundError";
  }
}
