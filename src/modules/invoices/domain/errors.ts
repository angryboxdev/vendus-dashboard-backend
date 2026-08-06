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

export class DuplicateInvoiceError extends Error {
  constructor(invoiceNumber: string, supplierName: string) {
    super(`Já existe uma fatura "${invoiceNumber}" para o fornecedor "${supplierName}"`);
    this.name = "DuplicateInvoiceError";
  }
}

export class ChannelRequiredError extends Error {
  constructor(categoryId: string) {
    super(`Canal obrigatório para a subcategoria: ${categoryId}`);
    this.name = "ChannelRequiredError";
  }
}
