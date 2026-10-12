import type { PendingItem } from "./entities/period.js";

/** Erros do Novo RH → Períodos. O controller converte-os em RFC 7807. */

export class PeriodValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "PeriodValidationError";
  }
}

export class PeriodConflictError extends Error {
  constructor(
    message: string,
    readonly code: "overlap" | "invalid_state" | "precheck_failed" | "already_approved" | "reopen_pending" | "expired",
    readonly pending: PendingItem[] = [],
  ) {
    super(message);
    this.name = "PeriodConflictError";
  }
}

export class PeriodForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeriodForbiddenError";
  }
}

export class PeriodNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeriodNotFoundError";
  }
}
