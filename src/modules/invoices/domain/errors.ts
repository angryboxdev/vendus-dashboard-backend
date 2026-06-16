export class InvoiceNotFoundError extends Error {
  constructor(id: string) {
    super(`Invoice not found: ${id}`);
    this.name = "InvoiceNotFoundError";
  }
}

export class InvoiceLineNotFoundError extends Error {
  constructor(id: string) {
    super(`Invoice line not found: ${id}`);
    this.name = "InvoiceLineNotFoundError";
  }
}

export class InvoiceAlreadyCancelledError extends Error {
  constructor(id: string) {
    super(`Invoice is already cancelled: ${id}`);
    this.name = "InvoiceAlreadyCancelledError";
  }
}
