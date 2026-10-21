import type { Violation } from "./entities/violation.js";

/** Erros do Novo RH → Escalas. O controller converte-os em RFC 7807. */

export class RosterValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "RosterValidationError";
  }
}

/** 422: restrições com severidade de bloqueio (RE-16). */
export class RosterBlockedError extends Error {
  constructor(readonly violations: Violation[]) {
    super("A escala não cumpre restrições obrigatórias.");
    this.name = "RosterBlockedError";
  }
}

/** 409: há avisos por confirmar (RE-16), ou estado não permite. */
export class RosterConflictError extends Error {
  constructor(
    message: string,
    readonly code: "confirmation_required" | "duplicate_name" | "nothing_to_publish" | "invalid_state" | "period_closed" | "template_in_use",
    readonly violations: Violation[] = [],
  ) {
    super(message);
    this.name = "RosterConflictError";
  }
}

export class RosterForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RosterForbiddenError";
  }
}

export class RosterNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RosterNotFoundError";
  }
}
