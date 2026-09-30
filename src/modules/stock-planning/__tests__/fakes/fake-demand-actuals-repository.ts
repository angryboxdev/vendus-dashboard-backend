import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  DemandActualRow,
  DemandActualsHistoryFilter,
  DemandActualsRepositoryPort,
  UpsertDemandActualsCommand,
} from "../../domain/ports/out/demand-actuals-repository.port.js";
import type { DemandSourceType } from "../../domain/services/impact-simulation.service.js";

export class FakeDemandActualsRepository implements DemandActualsRepositoryPort {
  rows: (DemandActualRow & { organizationId: OrganizationId; locationId: string })[] = [];

  async upsertMany(command: UpsertDemandActualsCommand): Promise<void> {
    for (const row of command.rows) {
      const idx = this.rows.findIndex(
        (r) =>
          r.organizationId === command.organizationId &&
          r.locationId === command.locationId &&
          r.demandSourceType === row.demandSourceType &&
          r.demandSourceRef === row.demandSourceRef &&
          r.saleDate === row.saleDate,
      );
      const stored = { ...row, organizationId: command.organizationId, locationId: command.locationId };
      if (idx >= 0) this.rows[idx] = stored;
      else this.rows.push(stored);
    }
  }

  async findHistory(filter: DemandActualsHistoryFilter): Promise<DemandActualRow[]> {
    return this.rows
      .filter(
        (r) =>
          r.organizationId === filter.organizationId &&
          r.locationId === filter.locationId &&
          r.demandSourceType === filter.demandSourceType &&
          r.demandSourceRef === filter.demandSourceRef &&
          r.saleDate >= filter.since &&
          r.saleDate <= filter.until,
      )
      .map(({ demandSourceType, demandSourceRef, saleDate, quantitySold }) => ({ demandSourceType, demandSourceRef, saleDate, quantitySold }));
  }

  async listActiveDemandSources(
    organizationId: OrganizationId,
    locationId: string,
    since: string,
    until: string,
  ): Promise<{ demandSourceType: DemandSourceType; demandSourceRef: string }[]> {
    const seen = new Map<string, { demandSourceType: DemandSourceType; demandSourceRef: string }>();
    for (const r of this.rows) {
      if (r.organizationId !== organizationId || r.locationId !== locationId) continue;
      if (r.saleDate < since || r.saleDate > until) continue;
      seen.set(`${r.demandSourceType}:${r.demandSourceRef}`, { demandSourceType: r.demandSourceType, demandSourceRef: r.demandSourceRef });
    }
    return [...seen.values()];
  }
}
