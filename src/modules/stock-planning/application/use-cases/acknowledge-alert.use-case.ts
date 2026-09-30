import { PlanningAlertNotFoundError } from "../../domain/errors.js";
import type { AcknowledgeAlertCommand, AcknowledgeAlertPort, PlanningAlertRowDTO } from "../../domain/ports/in/stock-planning.ports.js";
import type { PlanningAlertRepositoryPort } from "../../domain/ports/out/planning-alert-repository.port.js";
import type { StockItemPlanningReadPort } from "../../domain/ports/out/stock-item-planning-read.port.js";
import { toAlertRowDTO } from "./shared-alert.js";

export class AcknowledgeAlertUseCase implements AcknowledgeAlertPort {
  constructor(
    private readonly planningAlertRepo: PlanningAlertRepositoryPort,
    private readonly stockItemPlanningRead: StockItemPlanningReadPort,
  ) {}

  async execute(command: AcknowledgeAlertCommand): Promise<PlanningAlertRowDTO> {
    const alert = await this.planningAlertRepo.findById(command.organizationId, command.alertId);
    if (!alert) throw new PlanningAlertNotFoundError(command.alertId);
    const acknowledged = alert.acknowledge();
    await this.planningAlertRepo.upsert(command.organizationId, acknowledged);
    const item = await this.stockItemPlanningRead.findById(command.organizationId, acknowledged.itemId);
    return toAlertRowDTO(acknowledged, item?.name ?? acknowledged.itemId);
  }
}
