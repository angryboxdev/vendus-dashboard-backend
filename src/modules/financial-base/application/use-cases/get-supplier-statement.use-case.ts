import { SupplierNotFoundError } from "../../domain/errors.js";
import type { SupplierRepositoryPort } from "../../domain/ports/out/supplier-repository.port.js";
import type { SupplierInvoiceStatsPort } from "../../domain/ports/out/supplier-invoice-stats.port.js";
import type {
  GetSupplierStatementCommand,
  GetSupplierStatementPort,
  SupplierStatementDTO,
} from "../../domain/ports/in/supplier-statement.ports.js";
import { toSupplierDTO } from "./shared.js";

export class GetSupplierStatementUseCase implements GetSupplierStatementPort {
  constructor(
    private readonly supplierRepository: SupplierRepositoryPort,
    private readonly invoiceStats: SupplierInvoiceStatsPort,
  ) {}

  async execute(command: GetSupplierStatementCommand): Promise<SupplierStatementDTO> {
    const supplier = await this.supplierRepository.findById(command.organizationId, command.id);
    if (!supplier) throw new SupplierNotFoundError(command.id);

    const filter = command.startDate ?? command.endDate
      ? {
          ...(command.startDate && { startDate: command.startDate }),
          ...(command.endDate && { endDate: command.endDate }),
        }
      : undefined;

    const invoices = await this.invoiceStats.listInvoicesBySupplier(
      command.organizationId,
      supplier.id,
      filter,
    );

    // Calcula stats sobre as faturas filtradas (não sobre o histórico completo)
    const EXCLUDED = new Set(["cancelled", "draft_ai", "pending_review"]);
    const PENDING = new Set(["pending", "overdue", "partial"]);

    let invoiceCount = 0;
    let totalBilled = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let lastInvoiceDate: Date | null = null;
    let lastPaymentDate: Date | null = null;

    for (const inv of invoices) {
      if (!EXCLUDED.has(inv.status)) {
        invoiceCount++;
        totalBilled += inv.totalWithVat;
        if (!lastInvoiceDate || inv.invoiceDate > lastInvoiceDate) {
          lastInvoiceDate = inv.invoiceDate;
        }
      }
      if (inv.status === "paid") {
        totalPaid += inv.totalWithVat;
        if (inv.paidAt && (!lastPaymentDate || inv.paidAt > lastPaymentDate)) {
          lastPaymentDate = inv.paidAt;
        }
      }
      if (PENDING.has(inv.status)) {
        totalPending += inv.totalWithVat;
      }
    }

    return {
      supplier: toSupplierDTO(supplier),
      stats: { invoiceCount, totalBilled, totalPaid, totalPending, lastInvoiceDate, lastPaymentDate },
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        totalWithoutVat: inv.totalWithoutVat,
        vatAmount: inv.vatAmount,
        totalWithVat: inv.totalWithVat,
        status: inv.status,
        paidAt: inv.paidAt,
        attachmentUrl: inv.attachmentUrl,
      })),
      period: {
        startDate: command.startDate ?? null,
        endDate: command.endDate ?? null,
      },
    };
  }
}
