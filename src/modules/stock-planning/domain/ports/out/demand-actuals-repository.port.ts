import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DemandSourceType } from "../../services/impact-simulation.service.js";

export interface DemandActualRow {
  demandSourceType: DemandSourceType;
  /** `"<pizzaId>:<size>"` para pizza, `"<stockItemId>"` para stock — mesma identidade em toda a stack (secção "reaproveita ConsumptionMappingEntry"). */
  demandSourceRef: string;
  /** YYYY-MM-DD */
  saleDate: string;
  quantitySold: number;
}

export interface UpsertDemandActualsCommand {
  organizationId: OrganizationId;
  locationId: string;
  rows: DemandActualRow[];
}

export interface DemandActualsHistoryFilter {
  organizationId: OrganizationId;
  locationId: string;
  demandSourceType: DemandSourceType;
  demandSourceRef: string;
  /** YYYY-MM-DD, inclusive. */
  since: string;
  /** YYYY-MM-DD, inclusive. */
  until: string;
}

/**
 * Cache diária de vendas por fonte de procura (`sales_demand_actuals_daily`)
 * — nunca fonte de verdade de stock, só histórico para treinar/validar o
 * forecast (secção 86). `UNIQUE(org_id, location_id, demand_source_type,
 * demand_source_ref, sale_date)` — upsert idempotente (reprocessar o mesmo
 * dia nunca duplica).
 */
export interface DemandActualsRepositoryPort {
  upsertMany(command: UpsertDemandActualsCommand): Promise<void>;
  findHistory(filter: DemandActualsHistoryFilter): Promise<DemandActualRow[]>;
  /** Todas as fontes de procura com pelo menos um registo no período — usado para saber sobre o que gerar previsão. */
  listActiveDemandSources(
    organizationId: OrganizationId,
    locationId: string,
    since: string,
    until: string,
  ): Promise<{ demandSourceType: DemandSourceType; demandSourceRef: string }[]>;
}
