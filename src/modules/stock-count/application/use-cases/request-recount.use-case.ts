import { StockCountLineNotFoundError, StaleCountLineVersionError } from "../../domain/errors.js";
import type { RequestRecountCommand, RequestRecountPort, StockCountLineDTO } from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountRepositoryPort } from "../../domain/ports/out/stock-count-repository.port.js";
import type { StockCountAuditLogPort } from "../../domain/ports/out/stock-count-audit-log.port.js";
import { buildLineDTO } from "./shared.js";

/** Recontagem manual (secção 26) — motivo opcional (só a resolução manual de valor final exige motivo obrigatório). */
export class RequestRecountUseCase implements RequestRecountPort {
  constructor(
    private readonly repository: StockCountRepositoryPort,
    private readonly auditLog: StockCountAuditLogPort,
  ) {}

  async execute(command: RequestRecountCommand): Promise<StockCountLineDTO> {
    const line = await this.repository.findLineById(command.organizationId, command.lineId);
    if (!line) throw new StockCountLineNotFoundError(command.lineId);
    if (line.version !== command.expectedVersion) throw new StaleCountLineVersionError(line.version);

    const before = line.toProps();
    const updated = line.requestRecount(command.reason ?? null);
    await this.repository.saveLine(command.organizationId, updated, command.expectedVersion);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_count_line",
      entityId: command.lineId,
      action: "request_recount",
      before,
      after: updated.toProps(),
      reason: command.reason ?? null,
    });

    return buildLineDTO(this.repository, command.organizationId, updated);
  }
}
