/** Erros do Novo RH → Ausências. O controller converte-os em RFC 7807. */

export class AbsenceValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "AbsenceValidationError";
  }
}

/** 422: uma regra do tipo/calendário impede o pedido (RE-19, TK-14, saldo, datas bloqueadas…). */
export class AbsenceRuleError extends Error {
  constructor(
    message: string,
    readonly code:
      | "date_unavailable"
      | "outside_contract"
      | "insufficient_balance"
      | "blocked_date"
      | "min_consecutive"
      | "max_consecutive"
      | "half_day_not_allowed"
      | "attachment_required"
      | "no_approver"
      | "no_compensation_type" | "attachments_unavailable",
  ) {
    super(message);
    this.name = "AbsenceRuleError";
  }
}

export class AbsenceConflictError extends Error {
  constructor(
    message: string,
    readonly code: "overlap" | "duplicate_name" | "not_pending" | "already_decided" | "period_closed",
  ) {
    super(message);
    this.name = "AbsenceConflictError";
  }
}

export class AbsenceForbiddenError extends Error {
  constructor(
    message: string,
    readonly code: "not_approver" | "self_approval" | "not_allowed",
  ) {
    super(message);
    this.name = "AbsenceForbiddenError";
  }
}

export class AbsenceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbsenceNotFoundError";
  }
}
