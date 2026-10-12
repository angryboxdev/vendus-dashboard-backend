/** Erros do Novo RH → Assiduidade. O controller converte-os em RFC 7807. */

export class AttendanceValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "AttendanceValidationError";
  }
}

/** 409: estado não permite (pedido já decidido, prazo de recusa terminado, mesma marcação seguida). */
export class AttendanceConflictError extends Error {
  constructor(
    message: string,
    readonly code: "already_decided" | "refusal_window_closed" | "not_refusable" | "same_state" | "already_resolved" | "period_closed" | "duplicate_name" | "stale",
  ) {
    super(message);
    this.name = "AttendanceConflictError";
  }
}

/** 403: auto-aprovação ou correção do próprio registo (separação de funções). */
export class AttendanceForbiddenError extends Error {
  constructor(
    message: string,
    readonly code: "self_approval" | "self_revision" | "not_own_record" | "not_approver",
  ) {
    super(message);
    this.name = "AttendanceForbiddenError";
  }
}

export class AttendanceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendanceNotFoundError";
  }
}

/** 422: a marcação foi recusada por uma regra de bloqueio (RE-12, RE-13, CF-11). */
export class PunchRefusedError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "PunchRefusedError";
  }
}
