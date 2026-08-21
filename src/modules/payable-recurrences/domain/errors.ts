export class RecurrenceNotFoundError extends Error {
  constructor(id: string) {
    super(`Recurrence "${id}" not found`);
    this.name = "RecurrenceNotFoundError";
  }
}

export class RecurrenceClosedError extends Error {
  constructor(id: string) {
    super(`Recurrence "${id}" is closed and cannot be modified`);
    this.name = "RecurrenceClosedError";
  }
}

export class RecurrenceAlreadyPausedError extends Error {
  constructor(id: string) {
    super(`Recurrence "${id}" is already paused`);
    this.name = "RecurrenceAlreadyPausedError";
  }
}

export class RecurrenceNotPausedError extends Error {
  constructor(id: string) {
    super(`Recurrence "${id}" is not paused`);
    this.name = "RecurrenceNotPausedError";
  }
}

export class OccurrenceNotFoundError extends Error {
  constructor(id: string) {
    super(`Occurrence "${id}" not found`);
    this.name = "OccurrenceNotFoundError";
  }
}

export class OccurrenceAlreadyExistsError extends Error {
  constructor(recurrenceId: string, period: string) {
    super(`Occurrence for recurrence "${recurrenceId}" in period "${period}" already exists`);
    this.name = "OccurrenceAlreadyExistsError";
  }
}

export class OccurrenceInvalidTransitionError extends Error {
  constructor(id: string, from: string, to: string) {
    super(`Occurrence "${id}" cannot transition from "${from}" to "${to}"`);
    this.name = "OccurrenceInvalidTransitionError";
  }
}

export class OccurrenceInvoiceRequiredError extends Error {
  constructor(id: string) {
    super(`Occurrence "${id}" requires a linked invoice before it can be marked as paid`);
    this.name = "OccurrenceInvoiceRequiredError";
  }
}

export class InvoiceAlreadyLinkedError extends Error {
  constructor(invoiceId: string) {
    super(`A fatura "${invoiceId}" já está associada a outra ocorrência recorrente`);
    this.name = "InvoiceAlreadyLinkedError";
  }
}
