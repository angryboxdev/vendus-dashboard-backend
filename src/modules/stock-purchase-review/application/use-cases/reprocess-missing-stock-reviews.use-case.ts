import type {
  ReprocessMissingStockReviewsCommand,
  ReprocessMissingStockReviewsPort,
  ReprocessMissingStockReviewsResult,
  RecordInvoiceFinalizedForStockPort,
} from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { InvoiceReadPort } from "../../domain/ports/out/invoice-read.port.js";
import type { StockPurchaseReviewRepositoryPort } from "../../domain/ports/out/stock-purchase-review-repository.port.js";

const LOOKBACK_DAYS = 30;

/**
 * Rede de segurança em vez de outbox formal (decisão confirmada com o
 * utilizador): não há fila de mensagens neste codebase. Reexecuta o mesmo
 * caminho de decisão+criação para faturas finalizadas recentes sem revisão
 * correspondente — sempre seguro correr redundantemente, já que a criação
 * já é idempotente (`invoice_id UNIQUE` + `ON CONFLICT DO NOTHING`).
 */
export class ReprocessMissingStockReviewsUseCase implements ReprocessMissingStockReviewsPort {
  constructor(
    private readonly invoiceRead: InvoiceReadPort,
    private readonly reviewRepository: StockPurchaseReviewRepositoryPort,
    private readonly recordInvoiceFinalizedForStock: RecordInvoiceFinalizedForStockPort,
  ) {}

  async execute(command: ReprocessMissingStockReviewsCommand): Promise<ReprocessMissingStockReviewsResult> {
    const since = new Date();
    since.setDate(since.getDate() - LOOKBACK_DAYS);
    const sinceDate = since.toISOString().slice(0, 10);

    const invoices = await this.invoiceRead.listFinalizedSince(command.organizationId, sinceDate);

    let created = 0;
    for (const invoice of invoices) {
      const existing = await this.reviewRepository.findByInvoiceId(command.organizationId, invoice.id);
      if (existing) continue;

      await this.recordInvoiceFinalizedForStock.execute({
        organizationId: command.organizationId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        supplierId: invoice.supplierId,
        supplierName: invoice.supplierName,
        supplierNif: invoice.supplierNif,
        override: invoice.stockReviewOverride,
        overrideReason: invoice.stockReviewOverrideReason,
        lines: invoice.lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unitCostWithoutVat: l.unitCostWithoutVat,
          totalWithVat: l.totalWithVat,
          costCenterCategoryId: l.costCenterCategoryId,
          locationId: l.locationId,
        })),
        actor: null,
      });

      const createdReview = await this.reviewRepository.findByInvoiceId(command.organizationId, invoice.id);
      if (createdReview) created += 1;
    }

    return { invoicesScanned: invoices.length, reviewsCreated: created };
  }
}
