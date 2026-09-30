import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { CompanyCountSettings, StockCountSettingsPort } from "../../domain/ports/out/stock-count-settings.port.js";

interface Row {
  default_tolerance_absolute_qty: number | null;
  default_tolerance_percent: number | null;
  default_tolerance_financial_impact: number | null;
  blind_count_default: boolean;
  max_recounts: number | null;
}

const DEFAULTS: CompanyCountSettings = { defaultTolerance: null, blindCountDefault: true, maxRecounts: null };

/** Uma linha por organização (secção 33). Sem linha configurada ainda ⇒ defaults conservadores em TS, nunca inventados na BD. */
export class SupabaseStockCountSettingsRepository implements StockCountSettingsPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async get(organizationId: OrganizationId): Promise<CompanyCountSettings> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_count_settings")
      .select("default_tolerance_absolute_qty, default_tolerance_percent, default_tolerance_financial_impact, blind_count_default, max_recounts")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return DEFAULTS;
    const row = data as unknown as Row;
    const tolerance = {
      absoluteQty: row.default_tolerance_absolute_qty != null ? Number(row.default_tolerance_absolute_qty) : null,
      percent: row.default_tolerance_percent != null ? Number(row.default_tolerance_percent) : null,
      financialImpact: row.default_tolerance_financial_impact != null ? Number(row.default_tolerance_financial_impact) : null,
    };
    const hasTolerance = tolerance.absoluteQty != null || tolerance.percent != null || tolerance.financialImpact != null;
    return {
      defaultTolerance: hasTolerance ? tolerance : null,
      blindCountDefault: Boolean(row.blind_count_default),
      maxRecounts: row.max_recounts != null ? Number(row.max_recounts) : null,
    };
  }
}
