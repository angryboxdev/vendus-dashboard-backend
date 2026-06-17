import type { PayableEntryRepositoryPort } from "../../domain/ports/out/payable-entry-repository.port.js";
import type {
  GetPayableSummaryPort,
  ListPayableEntriesFilter,
  PayableSummaryDTO,
} from "../../domain/ports/in/payable-entry.ports.js";
import type { PayableStatus } from "../../domain/entities/payable-entry.js";
import { PayableSummaryService } from "../../domain/services/payable-summary.service.js";

export class GetPayableSummaryUseCase implements GetPayableSummaryPort {
  private readonly summaryService = new PayableSummaryService();

  constructor(private readonly repo: PayableEntryRepositoryPort) {}

  async execute(filter?: ListPayableEntriesFilter): Promise<PayableSummaryDTO> {
    const entries = await this.repo.findAll({
      supplierId: filter?.supplierId,
      costCenterId: filter?.costCenterId,
      status: filter?.status as PayableStatus | undefined,
      from: filter?.from ? new Date(filter.from) : undefined,
      to: filter?.to ? new Date(filter.to) : undefined,
    });
    return this.summaryService.computeSummary(entries, new Date());
  }
}
