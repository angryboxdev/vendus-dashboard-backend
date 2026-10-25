import type { DeleteInvoiceLineOptions, DeleteInvoiceLinePort } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import { InvoiceNotFoundError, InvoiceLineNotFoundError, LineDetailModeError } from "../../domain/errors.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { StockLockedLinesDeps } from "./shared-stock-locked-lines.js";
import { guardAgainstBlockingStockReview } from "./shared-stock-review-guard.js";

export class DeleteInvoiceLineUseCase implements DeleteInvoiceLinePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
    private readonly stockLines?: StockLockedLinesDeps,
  ) {}

  async execute(organizationId: OrganizationId, invoiceId: string, lineId: string, options: DeleteInvoiceLineOptions = {}): Promise<void> {
    const invoice = await this.invoiceRepo.findById(organizationId, invoiceId);
    if (!invoice) throw new InvoiceNotFoundError(invoiceId);

    if (invoice.lineDetailMode === "simple") {
      throw new LineDetailModeError(invoiceId);
    }

    const lines = await this.lineRepo.findByInvoiceId(organizationId, invoiceId);
    const line = lines.find((l) => l.id === lineId);
    if (!line) throw new InvoiceLineNotFoundError(lineId);

    // Fatura em Compras por rever: as linhas da revisão apontam para esta (FK
    // `stock_review_lines_invoice_line_id_fkey`) — já movimentada → bloqueia; senão só com confirmação.
    if (this.stockLines) {
      await guardAgainstBlockingStockReview({
        organizationId,
        invoiceId,
        confirmRemoveStockReview: options.confirmRemoveStockReview,
        actor: options.actor ?? "system",
        statusRead: this.stockLines.statusRead,
        draftDelete: this.stockLines.draftDelete,
      });
    }

    await this.lineRepo.deleteLineById(organizationId, lineId);
  }
}
