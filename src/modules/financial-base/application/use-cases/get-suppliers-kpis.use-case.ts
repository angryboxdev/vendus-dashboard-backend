import type { SupplierRepositoryPort } from "../../domain/ports/out/supplier-repository.port.js";
import type { SupplierInvoiceStatsPort } from "../../domain/ports/out/supplier-invoice-stats.port.js";
import type {
  GetSuppliersKpisPort,
  SuppliersKpisDTO,
} from "../../domain/ports/in/supplier-detail.ports.js";

export class GetSuppliersKpisUseCase implements GetSuppliersKpisPort {
  constructor(
    private readonly supplierRepository: SupplierRepositoryPort,
    private readonly invoiceStats: SupplierInvoiceStatsPort,
  ) {}

  async execute(): Promise<SuppliersKpisDTO> {
    const allSuppliers = await this.supplierRepository.findAll();

    if (allSuppliers.length === 0) {
      return { totalActive: 0, totalInactive: 0, totalWithPending: 0, totalBilledAll: 0 };
    }

    const totalActive = allSuppliers.filter((s) => s.status === "active").length;
    const totalInactive = allSuppliers.filter((s) => s.status === "inactive").length;

    const summaries = await this.invoiceStats.getSummariesForSuppliers(
      allSuppliers.map((s) => s.id),
    );

    const totalBilledAll = summaries.reduce((acc, s) => acc + s.totalBilled, 0);
    const totalWithPending = summaries.filter((s) => s.totalPending > 0).length;

    return { totalActive, totalInactive, totalWithPending, totalBilledAll };
  }
}
