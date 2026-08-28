import { SupplierNotFoundError } from "../../domain/errors.js";
import type { SupplierRepositoryPort } from "../../domain/ports/out/supplier-repository.port.js";
import type { SupplierInvoiceStatsPort } from "../../domain/ports/out/supplier-invoice-stats.port.js";
import type {
  GetSupplierDetailCommand,
  GetSupplierDetailPort,
  SupplierDetailDTO,
  SupplierStatsDTO,
} from "../../domain/ports/in/supplier-detail.ports.js";
import { toSupplierDTO } from "./shared.js";

const EMPTY_STATS: SupplierStatsDTO = {
  invoiceCount: 0,
  totalBilled: 0,
  totalPaid: 0,
  totalPending: 0,
  lastInvoiceDate: null,
  lastPaymentDate: null,
};

export class GetSupplierDetailUseCase implements GetSupplierDetailPort {
  constructor(
    private readonly supplierRepository: SupplierRepositoryPort,
    private readonly invoiceStats: SupplierInvoiceStatsPort,
  ) {}

  async execute(command: GetSupplierDetailCommand): Promise<SupplierDetailDTO> {
    const supplier = await this.supplierRepository.findById(command.organizationId, command.id);
    if (!supplier) throw new SupplierNotFoundError(command.id);

    const [summaries, invoices] = await Promise.all([
      this.invoiceStats.getSummariesForSuppliers(command.organizationId, [supplier.id]),
      this.invoiceStats.listInvoicesBySupplier(command.organizationId, supplier.id),
    ]);

    const summary = summaries[0];

    return {
      ...toSupplierDTO(supplier),
      stats: summary
        ? {
            invoiceCount: summary.invoiceCount,
            totalBilled: summary.totalBilled,
            totalPaid: summary.totalPaid,
            totalPending: summary.totalPending,
            lastInvoiceDate: summary.lastInvoiceDate,
            lastPaymentDate: summary.lastPaymentDate,
          }
        : EMPTY_STATS,
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
    };
  }
}
