export class EmailIntakeNotConfiguredError extends Error {
  constructor() {
    super("As faturas por email ainda não estão configuradas no servidor.");
    this.name = "EmailIntakeNotConfiguredError";
  }
}

export class EmailIntakeNotAllowedError extends Error {
  constructor() {
    super("As faturas por email ainda não estão disponíveis para esta empresa.");
    this.name = "EmailIntakeNotAllowedError";
  }
}
