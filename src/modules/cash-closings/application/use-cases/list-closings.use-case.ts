import type { ListClosingsPort, ListClosingsQuery, ListClosingsResult } from "../../domain/ports/in/list-closings.port.js";
import type { CashClosingRepositoryPort, ClosingListFilter } from "../../domain/ports/out/cash-closing-repository.port.js";
import { toDto } from "./submit-closing.use-case.js";

export class ListClosingsUseCase implements ListClosingsPort {
  constructor(private readonly closingRepository: CashClosingRepositoryPort) {}

  async execute(query: ListClosingsQuery): Promise<ListClosingsResult> {
    // `date` é atalho para from=to=date (backward compat com endpoints públicos)
    const from = query.from ?? query.date;
    const to = query.to ?? query.date;

    const filter: ClosingListFilter = {
      from,
      to,
      status: query.status,
      employeeId: query.employeeId,
      limit: query.limit,
      offset: query.offset,
    };

    const { closings, total } = await this.closingRepository.list(query.organizationId, filter);
    return { closings: closings.map(toDto), total };
  }
}
