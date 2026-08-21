import type { FinancialObligationRepositoryPort } from "../../domain/ports/out/obligation-repository.port.js";
import type {
  ListObligationsPort,
  ListObligationsFilter,
  FinancialObligationDTO,
} from "../../domain/ports/in/obligation.ports.js";
import { toDTO } from "./shared.js";

export class ListObligationsUseCase implements ListObligationsPort {
  constructor(private readonly repo: FinancialObligationRepositoryPort) {}

  async execute(filter?: ListObligationsFilter): Promise<FinancialObligationDTO[]> {
    const repoFilter: import("../../domain/ports/out/obligation-repository.port.js").ObligationFilter = {};
    if (filter?.from) repoFilter.from = new Date(filter.from);
    if (filter?.to) repoFilter.to = new Date(filter.to);
    if (filter?.supplierId) repoFilter.supplierId = filter.supplierId;
    if (filter?.status) repoFilter.status = filter.status;
    if (filter?.source) repoFilter.source = filter.source;

    const obligations = await this.repo.findAll(repoFilter);
    return obligations.map(toDTO);
  }
}
