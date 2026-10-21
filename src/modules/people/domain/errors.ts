/** Erros do Novo RH → Pessoas. O controller converte-os em RFC 7807. */

export class PeopleValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "PeopleValidationError";
  }
}

/** 409: documento duplicado (RE-2), contratos sobrepostos (TK-9), versão desatualizada. */
export class PeopleConflictError extends Error {
  constructor(
    message: string,
    readonly code: "duplicate_document" | "contract_overlap" | "assignment_overlap" | "version_conflict" | "pin_taken",
    readonly field?: string,
  ) {
    super(message);
    this.name = "PeopleConflictError";
  }
}

/** 422: regra de negócio (ex.: complemento noutra moeda — CF-14). */
export class PeopleRuleViolation extends Error {
  constructor(
    message: string,
    readonly rule: string,
  ) {
    super(message);
    this.name = "PeopleRuleViolation";
  }
}

/** 403: campo sem permissão de edição (privacidade por campo) ou exportação sem permissão. */
export class PeopleForbiddenError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "PeopleForbiddenError";
  }
}

export class PeopleNotFoundError extends Error {
  constructor(message = "Colaborador não encontrado.") {
    super(message);
    this.name = "PeopleNotFoundError";
  }
}
