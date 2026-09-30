import type {
  ListStockPurchaseReviewsCommand,
  ListStockPurchaseReviewsPort,
  StockPurchaseReviewRowDTO,
} from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { StockPurchaseReviewRepositoryPort } from "../../domain/ports/out/stock-purchase-review-repository.port.js";

export class ListStockPurchaseReviewsUseCase implements ListStockPurchaseReviewsPort {
  constructor(private readonly repository: StockPurchaseReviewRepositoryPort) {}

  async execute(command: ListStockPurchaseReviewsCommand): Promise<StockPurchaseReviewRowDTO[]> {
    const reviews = await this.repository.findAll(command.organizationId, {
      ...(command.status !== undefined && { status: command.status }),
      ...(command.supplierId !== undefined && { supplierId: command.supplierId }),
      ...(command.from !== undefined && { from: command.from }),
      ...(command.to !== undefined && { to: command.to }),
      ...(command.search !== undefined && { search: command.search }),
    });

    const rows: StockPurchaseReviewRowDTO[] = [];
    for (const review of reviews) {
      const lines = await this.repository.findLinesByReviewId(command.organizationId, review.id);
      const p = review.toProps();
      rows.push({
        id: p.id,
        invoiceId: p.invoiceId,
        supplierName: p.supplierName,
        invoiceNumber: p.invoiceNumber,
        invoiceDate: p.invoiceDate,
        status: p.status,
        linesCount: lines.length,
      });
    }
    return rows.sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : a.invoiceDate > b.invoiceDate ? -1 : 0));
  }
}
