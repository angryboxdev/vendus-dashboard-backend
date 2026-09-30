import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { DemandActualRow } from "../../domain/ports/out/demand-actuals-repository.port.js";
import type { VendusSalesReadPort } from "../../domain/ports/out/vendus-sales-read.port.js";

export class FakeVendusSalesRead implements VendusSalesReadPort {
  /** dateISO -> linhas devolvidas nesse dia. */
  byDate = new Map<string, DemandActualRow[]>();

  async fetchDailyActuals(_organizationId: OrganizationId, _locationId: string, date: string): Promise<DemandActualRow[]> {
    return this.byDate.get(date) ?? [];
  }
}
