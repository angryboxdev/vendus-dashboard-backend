import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  DemandActualRow,
  DemandActualsHistoryFilter,
  DemandActualsRepositoryPort,
  UpsertDemandActualsCommand,
} from "../../domain/ports/out/demand-actuals-repository.port.js";
import type { DemandSourceType } from "../../domain/services/impact-simulation.service.js";

interface Row {
  demand_source_type: DemandSourceType;
  demand_source_ref: string;
  sale_date: string;
  quantity_sold: number;
}

/**
 * `sales_demand_actuals_daily` — cache lida só por este módulo. Nunca
 * fonte de verdade de stock (secção 86); upsert idempotente por
 * `UNIQUE(org_id, location_id, demand_source_type, demand_source_ref,
 * sale_date)` — reprocessar o mesmo dia nunca duplica.
 */
export class SupabaseDemandActualsRepository implements DemandActualsRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async upsertMany(command: UpsertDemandActualsCommand): Promise<void> {
    if (command.rows.length === 0) return;
    const rows = command.rows.map((r) => ({
      id: randomUUID(),
      location_id: command.locationId,
      demand_source_type: r.demandSourceType,
      demand_source_ref: r.demandSourceRef,
      sale_date: r.saleDate,
      quantity_sold: r.quantitySold,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await this.scopedQuery(command.organizationId)
      .table("sales_demand_actuals_daily")
      .upsert(rows, { onConflict: "org_id,location_id,demand_source_type,demand_source_ref,sale_date" });
    if (error) throw new Error(error.message);
  }

  async findHistory(filter: DemandActualsHistoryFilter): Promise<DemandActualRow[]> {
    const { data, error } = await this.scopedQuery(filter.organizationId)
      .table("sales_demand_actuals_daily")
      .select("demand_source_type, demand_source_ref, sale_date, quantity_sold")
      .eq("location_id", filter.locationId)
      .eq("demand_source_type", filter.demandSourceType)
      .eq("demand_source_ref", filter.demandSourceRef)
      .gte("sale_date", filter.since)
      .lte("sale_date", filter.until)
      .order("sale_date", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      demandSourceType: r.demand_source_type,
      demandSourceRef: r.demand_source_ref,
      saleDate: r.sale_date,
      quantitySold: Number(r.quantity_sold),
    }));
  }

  async listActiveDemandSources(
    organizationId: OrganizationId,
    locationId: string,
    since: string,
    until: string,
  ): Promise<{ demandSourceType: DemandSourceType; demandSourceRef: string }[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("sales_demand_actuals_daily")
      .select("demand_source_type, demand_source_ref")
      .eq("location_id", locationId)
      .gte("sale_date", since)
      .lte("sale_date", until);
    if (error) throw new Error(error.message);
    const seen = new Map<string, { demandSourceType: DemandSourceType; demandSourceRef: string }>();
    for (const row of (data ?? []) as unknown as Row[]) {
      const key = `${row.demand_source_type}:${row.demand_source_ref}`;
      if (!seen.has(key)) seen.set(key, { demandSourceType: row.demand_source_type, demandSourceRef: row.demand_source_ref });
    }
    return [...seen.values()];
  }
}
