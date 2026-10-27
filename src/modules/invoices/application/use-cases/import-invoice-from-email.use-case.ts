import type { ImportInvoicePort, ImportInvoiceForStockPort } from "../../domain/ports/in/invoice.ports.js";
import type { ReadPaymentDocumentPort } from "../../domain/ports/in/payment-document.ports.js";
import type {
  ImportInvoiceFromEmailCommand,
  ImportInvoiceFromEmailPort,
  ImportInvoiceFromEmailResult,
} from "../../domain/ports/in/email-import.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import {
  AiBudgetExceededError,
  InvoiceAlreadyInStockError,
  InvoiceAlreadyInStockReviewError,
  InvoiceDraftInFinanceError,
  InvoiceExistsNotRoutedError,
  NotAFiscalInvoiceError,
  StockImportNoLinesError,
} from "../../domain/errors.js";

const ACTOR = "email";
const PDF = "application/pdf";

/**
 * Mesmo caminho do import manual em lote (`keepDraftLines`): documento de cobrança AT/SS → recusado (como no
 * ecrã, que o trata à parte); senão rascunho com as linhas lidas e a marca «email». Para o Stock, o import do
 * Stock. Os duplicados são os do pipeline (hash do ficheiro, identidade fiscal).
 */
export class ImportInvoiceFromEmailUseCase implements ImportInvoiceFromEmailPort {
  constructor(
    private readonly importInvoice: ImportInvoicePort,
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly readPaymentDocument?: ReadPaymentDocumentPort,
    private readonly importForStock?: ImportInvoiceForStockPort,
  ) {}

  async execute(command: ImportInvoiceFromEmailCommand): Promise<ImportInvoiceFromEmailResult> {
    const { organizationId, fileBuffer, filename } = command;
    try {
      if (this.readPaymentDocument) {
        const payment = await this.readPaymentDocument.execute(organizationId, { buffer: fileBuffer, mimeType: PDF }).catch(() => null);
        if (payment) {
          return { outcome: "rejected", code: "payment_document", message: "Documento de cobrança (AT/Segurança Social): importe-o à mão em Faturas." };
        }
      }

      if (command.destination === "stock") {
        if (!this.importForStock) return { outcome: "retry_later", message: "Importação para o Stock indisponível." };
        const r = await this.importForStock.execute({ organizationId, fileBuffer, filename, mimeType: PDF, actor: ACTOR });
        if (r.kind === "routed") return { outcome: "duplicate", invoiceId: r.invoiceId, message: "A fatura já estava lançada e foi enviada para Compras por rever." };
        await this.invoiceRepo.setIntakeSource(organizationId, r.invoiceId, "email");
        return { outcome: "imported", invoiceIds: [r.invoiceId] };
      }

      const r = await this.importInvoice.execute({ organizationId, fileBuffer, filename, mimeType: PDF, actor: ACTOR } as Parameters<ImportInvoicePort["execute"]>[0]);
      if (r.reused) {
        return {
          outcome: "duplicate",
          invoiceId: r.invoice.id,
          message: r.reused === "same_file" ? "O mesmo ficheiro já tinha sido importado." : "Esta fatura já existe (mesmo fornecedor e número).",
        };
      }
      const invoiceIds = [r.invoice.id, ...(r.siblings ?? []).filter((s) => !s.reused).map((s) => s.invoice.id)];
      for (const id of invoiceIds) await this.invoiceRepo.setIntakeSource(organizationId, id, "email");
      return { outcome: "imported", invoiceIds };
    } catch (e) {
      if (e instanceof NotAFiscalInvoiceError) return { outcome: "rejected", code: "not_invoice", message: e.message };
      if (e instanceof StockImportNoLinesError) return { outcome: "rejected", code: "no_lines", message: e.message };
      if (e instanceof InvoiceAlreadyInStockError || e instanceof InvoiceAlreadyInStockReviewError) {
        return { outcome: "duplicate", invoiceId: null, message: e.message };
      }
      if (e instanceof InvoiceDraftInFinanceError || e instanceof InvoiceExistsNotRoutedError) {
        return { outcome: "duplicate", invoiceId: e.invoiceId ?? null, message: e.message };
      }
      if (e instanceof AiBudgetExceededError) return { outcome: "retry_later", message: e.message };
      throw e;
    }
  }
}
