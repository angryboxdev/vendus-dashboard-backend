import type {
  SupplierFilter,
  SupplierRepositoryPort,
} from "../../domain/ports/out/supplier-repository.port.js";
import type { SupplierInvoiceStatsPort } from "../../domain/ports/out/supplier-invoice-stats.port.js";
import type {
  ListSuppliersWithStatsCommand,
  ListSuppliersWithStatsPort,
  SupplierWithStatsDTO,
} from "../../domain/ports/in/supplier-detail.ports.js";
import { toSupplierDTO } from "./shared.js";

export class ListSuppliersWithStatsUseCase implements ListSuppliersWithStatsPort {
  constructor(
    private readonly supplierRepository: SupplierRepositoryPort,
    private readonly invoiceStats: SupplierInvoiceStatsPort,
  ) {}

  async execute(command: ListSuppliersWithStatsCommand): Promise<SupplierWithStatsDTO[]> {
    const filter: SupplierFilter = {};
    if (command.status) filter.status = command.status;
    if (command.search) filter.search = command.search;

    const suppliers = await this.supplierRepository.findAll(command.organizationId, filter);
    if (suppliers.length === 0) return [];

    const summaries = await this.invoiceStats.getSummariesForSuppliers(
      command.organizationId,
      suppliers.map((s) => s.id),
    );
    const statsMap = new Map(summaries.map((s) => [s.supplierId, s]));

    return suppliers.map((supplier) => {
      const summary = statsMap.get(supplier.id);
      return {
        ...toSupplierDTO(supplier),
        stats: {
          invoiceCount: summary?.invoiceCount ?? 0,
          totalBilled: summary?.totalBilled ?? 0,
          totalPaid: summary?.totalPaid ?? 0,
          totalPending: summary?.totalPending ?? 0,
          lastInvoiceDate: summary?.lastInvoiceDate ?? null,
          lastPaymentDate: summary?.lastPaymentDate ?? null,
        },
      };
    });
  }
}
