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

export class LineDetailModeError extends Error {
  constructor(invoiceId: string) {
    super(`A fatura ${invoiceId} está em modo simples. Ative o modo detalhado antes de adicionar linhas.`);
    this.name = "LineDetailModeError";
  }
}

export class LinesTotalMismatchError extends Error {
  constructor(invoiceId: string) {
    super(`A soma das linhas da fatura ${invoiceId} não coincide com os totais do cabeçalho (tolerância: 0,01 EUR).`);
    this.name = "LinesTotalMismatchError";
  }
}

export class InvoiceAlreadyReconciledError extends Error {
  constructor(id: string) {
    super(`A fatura ${id} já está conciliada.`);
    this.name = "InvoiceAlreadyReconciledError";
  }
}

export class InvoiceNotPaidError extends Error {
  constructor(id: string) {
    super(`A fatura ${id} ainda não foi paga. Só é possível conciliar faturas pagas.`);
    this.name = "InvoiceNotPaidError";
  }
}
