import { PlanningAlertNotFoundError } from "../../domain/errors.js";
import type { PlanningAlertRowDTO, SilenceAlertCommand, SilenceAlertPort } from "../../domain/ports/in/stock-planning.ports.js";
import type { PlanningAlertRepositoryPort } from "../../domain/ports/out/planning-alert-repository.port.js";
import type { StockItemPlanningReadPort } from "../../domain/ports/out/stock-item-planning-read.port.js";
import { toAlertRowDTO } from "./shared-alert.js";

export class SilenceAlertUseCase implements SilenceAlertPort {
  constructor(
    private readonly planningAlertRepo: PlanningAlertRepositoryPort,
    private readonly stockItemPlanningRead: StockItemPlanningReadPort,
  ) {}

  async execute(command: SilenceAlertCommand): Promise<PlanningAlertRowDTO> {
    const alert = await this.planningAlertRepo.findById(command.organizationId, command.alertId);
    if (!alert) throw new PlanningAlertNotFoundError(command.alertId);
    const until = command.until ? new Date(command.until) : null;
    const silenced = alert.silence(command.reason, until);
    await this.planningAlertRepo.upsert(command.organizationId, silenced);
    const item = await this.stockItemPlanningRead.findById(command.organizationId, silenced.itemId);
    return toAlertRowDTO(silenced, item?.name ?? silenced.itemId);
  }
}
