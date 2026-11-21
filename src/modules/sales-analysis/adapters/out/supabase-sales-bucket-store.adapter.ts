import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { DateRange, IsoDate, SalesBucket, SalesChannel, SalesSource } from "../../domain/entities/sales-analysis.js";
import type { SalesBucketStorePort } from "../../domain/ports/out/sales-analysis.ports.js";

const PAGE = 1000;

type BucketRow = { sale_date: string; hour: number; channel: SalesChannel; gross_cents: number; net_cents: number; sale_count: number };

/**
 * Blocos guardados em `sales_analysis_buckets` e dias cobertos em
 * `sales_analysis_days` (D2: só através do scoped query).
 */
export class SupabaseSalesBucketStoreAdapter implements SalesBucketStorePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async coveredDays(org: OrganizationId, source: SalesSource, range: DateRange): Promise<Set<IsoDate>> {
    const out = new Set<IsoDate>();
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await this.scopedQuery(org)
        .table("sales_analysis_days")
        .select("sale_date")
        .eq("source", source)
        .gte("sale_date", range.from)
        .lte("sale_date", range.to)
        .order("sale_date")
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`sales_analysis_days: ${error.message}`);
      const rows = (data ?? []) as unknown as { sale_date: string }[];
      for (const r of rows) out.add(r.sale_date);
      if (rows.length < PAGE) break;
    }
    return out;
  }

  async buckets(org: OrganizationId, source: SalesSource, range: DateRange): Promise<SalesBucket[]> {
    const out: SalesBucket[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await this.scopedQuery(org)
        .table("sales_analysis_buckets")
        .select("sale_date, hour, channel, gross_cents, net_cents, sale_count")
        .eq("source", source)
        .gte("sale_date", range.from)
        .lte("sale_date", range.to)
        .order("sale_date")
        .order("hour")
        .order("channel")
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`sales_analysis_buckets: ${error.message}`);
      const rows = (data ?? []) as unknown as BucketRow[];
      for (const r of rows) {
        out.push({ date: r.sale_date, hour: r.hour, channel: r.channel, grossCents: Number(r.gross_cents), netCents: Number(r.net_cents), count: r.sale_count });
      }
      if (rows.length < PAGE) break;
    }
    return out;
  }

  async saveDays(org: OrganizationId, source: SalesSource, days: IsoDate[], buckets: SalesBucket[]): Promise<void> {
    if (days.length === 0) return;
    const daySet = new Set(days);
    const sorted = [...daySet].sort();
    const q = () => this.scopedQuery(org);
    const del = await q().table("sales_analysis_buckets").delete().eq("source", source).in("sale_date", sorted);
    if (del.error) throw new Error(`sales_analysis_buckets delete: ${del.error.message}`);
    const rows = buckets
      .filter((b) => daySet.has(b.date))
      .map((b) => ({ source, sale_date: b.date, hour: b.hour, channel: b.channel, gross_cents: b.grossCents, net_cents: b.netCents, sale_count: b.count }));
    for (let i = 0; i < rows.length; i += PAGE) {
      const ins = await q().table("sales_analysis_buckets").insert(rows.slice(i, i + PAGE));
      if (ins.error) throw new Error(`sales_analysis_buckets insert: ${ins.error.message}`);
    }
    const now = new Date().toISOString();
    const up = await q()
      .table("sales_analysis_days")
      .upsert(sorted.map((d) => ({ source, sale_date: d, synced_at: now })), { onConflict: "org_id,source,sale_date" });
    if (up.error) throw new Error(`sales_analysis_days upsert: ${up.error.message}`);
  }
}
