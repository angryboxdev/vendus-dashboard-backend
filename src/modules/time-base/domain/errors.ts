/** Erros do Novo RH → Tempo. O controller converte-os em RFC 7807. */

export class TimeValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "TimeValidationError";
  }
}

/** 409: nome repetido (CF-13), vigências sobrepostas, confirmação em falta. */
export class TimeConflictError extends Error {
  constructor(
    message: string,
    readonly code: "duplicate_name" | "version_overlap" | "assignment_overlap" | "confirmation_required",
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "TimeConflictError";
  }
}

export class TimeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeNotFoundError";
  }
}
