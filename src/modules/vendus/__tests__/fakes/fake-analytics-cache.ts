import type { AnalyticsCachePort, CachedMonthRow } from "../../domain/ports/out/analytics-cache.port.js";

export class FakeAnalyticsCache implements AnalyticsCachePort {
  private rows: CachedMonthRow[] = [];
  savedRows: CachedMonthRow[] = [];

  seed(rows: CachedMonthRow[]): void {
    this.rows = [...rows];
  }

  async getMonths(years: number[]): Promise<CachedMonthRow[]> {
    return this.rows.filter((r) => years.includes(r.year));
  }

  async saveMonths(rows: CachedMonthRow[]): Promise<void> {
    this.savedRows.push(...rows);
    for (const row of rows) {
      const idx = this.rows.findIndex((r) => r.year === row.year && r.month === row.month);
      if (idx >= 0) this.rows[idx] = row;
      else this.rows.push(row);
    }
  }
}
