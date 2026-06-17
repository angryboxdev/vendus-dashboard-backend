export class PayableEntryNotFoundError extends Error {
  constructor(id: string) {
    super(`Payable entry not found: ${id}`);
    this.name = "PayableEntryNotFoundError";
  }
}

export class PayableEntryAlreadyPaidError extends Error {
  constructor(id: string) {
    super(`Payable entry is already paid: ${id}`);
    this.name = "PayableEntryAlreadyPaidError";
  }
}

export class PayableEntryAlreadyCancelledError extends Error {
  constructor(id: string) {
    super(`Payable entry is already cancelled: ${id}`);
    this.name = "PayableEntryAlreadyCancelledError";
  }
}

export class PayableEntryCannotDeleteError extends Error {
  constructor(id: string) {
    super(`Payable entry can only be deleted when cancelled: ${id}`);
    this.name = "PayableEntryCannotDeleteError";
  }
}

export class InvoiceForPayableNotFoundError extends Error {
  constructor(id: string) {
    super(`Invoice not found when creating payable: ${id}`);
    this.name = "InvoiceForPayableNotFoundError";
  }
}
