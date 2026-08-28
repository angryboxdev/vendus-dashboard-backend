import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AnalyticsCachePort, CachedMonthRow } from "../../domain/ports/out/analytics-cache.port.js";

interface StoredRow extends CachedMonthRow {
  organizationId: OrganizationId;
}

export class FakeAnalyticsCache implements AnalyticsCachePort {
  private rows: StoredRow[] = [];
  savedRows: CachedMonthRow[] = [];

  seed(organizationId: OrganizationId, rows: CachedMonthRow[]): void {
    this.rows = rows.map((r) => ({ ...r, organizationId }));
  }

  async getMonths(organizationId: OrganizationId, years: number[]): Promise<CachedMonthRow[]> {
    return this.rows.filter((r) => r.organizationId === organizationId && years.includes(r.year));
  }

  async saveMonths(organizationId: OrganizationId, rows: CachedMonthRow[]): Promise<void> {
    this.savedRows.push(...rows);
    for (const row of rows) {
      const idx = this.rows.findIndex(
        (r) => r.organizationId === organizationId && r.year === row.year && r.month === row.month,
      );
      if (idx >= 0) this.rows[idx] = { ...row, organizationId };
      else this.rows.push({ ...row, organizationId });
    }
  }
}
