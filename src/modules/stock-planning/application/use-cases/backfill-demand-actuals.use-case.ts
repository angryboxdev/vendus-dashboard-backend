import type {
  BackfillDemandActualsCommand,
  BackfillDemandActualsPort,
  BackfillDemandActualsResultDTO,
} from "../../domain/ports/in/stock-planning.ports.js";
import type { DemandActualsRepositoryPort } from "../../domain/ports/out/demand-actuals-repository.port.js";
import type { LocationReadPort } from "../../domain/ports/out/location-read.port.js";
import type { VendusSalesReadPort } from "../../domain/ports/out/vendus-sales-read.port.js";
import { addDaysISO } from "./date-utils.js";

/**
 * Backfill único (~90 dias) de `sales_demand_actuals_daily`, admin-triggered
 * (secções 21-28, 96-97). **Risco de performance conhecido**: itera dia a
 * dia, sequencialmente, cada dia fazendo o mesmo custo de
 * `VendusSalesReadPort.fetchDailyActuals` que o incremento diário — ver
 * `legacy-vendus-sales-read.adapter.ts`/README para o porquê e a estimativa
 * de tempo. Uma falha num dia não interrompe os restantes (nunca perde o
 * backfill inteiro por causa de um dia com problema na API Vendus).
 */
export class BackfillDemandActualsUseCase implements BackfillDemandActualsPort {
  constructor(
    private readonly locationRead: LocationReadPort,
    private readonly vendusSalesRead: VendusSalesReadPort,
    private readonly demandActualsRepo: DemandActualsRepositoryPort,
  ) {}

  async execute(command: BackfillDemandActualsCommand): Promise<BackfillDemandActualsResultDTO[]> {
    const locations = command.locationId
      ? [{ id: command.locationId }]
      : await this.locationRead.listActive(command.organizationId);

    const results: BackfillDemandActualsResultDTO[] = [];
    for (const location of locations) {
      let daysProcessed = 0;
      const daysFailed: string[] = [];
      let cursor = command.since;
      while (cursor <= command.until) {
        try {
          const rows = await this.vendusSalesRead.fetchDailyActuals(command.organizationId, location.id, cursor);
          await this.demandActualsRepo.upsertMany({ organizationId: command.organizationId, locationId: location.id, rows });
          daysProcessed += 1;
        } catch {
          daysFailed.push(cursor);
        }
        cursor = addDaysISO(cursor, 1);
      }
      results.push({ locationId: location.id, daysProcessed, daysFailed });
    }
    return results;
  }
}
