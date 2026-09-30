import type { ListCountSessionsCommand, ListCountSessionsPort, StockCountSessionRowDTO } from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountRepositoryPort } from "../../domain/ports/out/stock-count-repository.port.js";

export class ListCountSessionsUseCase implements ListCountSessionsPort {
  constructor(private readonly repository: StockCountRepositoryPort) {}

  async execute(command: ListCountSessionsCommand): Promise<StockCountSessionRowDTO[]> {
    const sessions = await this.repository.findSessionsAll(command.organizationId, {
      ...(command.status !== undefined && { status: command.status }),
      ...(command.locationId !== undefined && { locationId: command.locationId }),
      ...(command.from !== undefined && { from: command.from }),
      ...(command.to !== undefined && { to: command.to }),
    });

    const rows: StockCountSessionRowDTO[] = [];
    for (const session of sessions) {
      const lines = await this.repository.findLinesBySessionId(command.organizationId, session.id);
      const p = session.toProps();
      rows.push({
        id: p.id,
        locationId: p.locationId,
        type: p.type,
        sessionNumber: p.sessionNumber,
        status: p.status,
        businessDate: p.businessDate,
        linesCount: lines.length,
        linesPendingCount: lines.filter((l) => l.status === "not_counted" || l.status === "recount_required").length,
      });
    }
    return rows.sort((a, b) => (a.businessDate < b.businessDate ? 1 : a.businessDate > b.businessDate ? -1 : 0));
  }
}
