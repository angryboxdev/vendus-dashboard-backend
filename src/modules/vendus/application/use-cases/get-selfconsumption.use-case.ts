import type { GetSelfConsumptionPort, GetSelfConsumptionParams } from "../../domain/ports/in/get-selfconsumption.port.js";
import type { VendusGatewayPort, RawSelfConsumptionProduct, RawSelfConsumptionRecord } from "../../domain/ports/out/vendus-gateway.port.js";
import type { VendusProductCatalogPort } from "../../domain/ports/out/vendus-product-catalog.port.js";
import type {
  VendusSelfConsumptionResult,
  VendusSelfConsumptionRecord,
  VendusSelfConsumptionProduct,
  VendusSelfConsumptionAnalytics,
  VendusSelfConsumptionByEmployee,
  VendusSelfConsumptionByCategory,
  VendusSelfConsumptionTopProduct,
} from "../../domain/entities/vendus-selfconsumption.js";
import type { VendusCategory } from "../../domain/entities/vendus-product.js";
import { detectCategory } from "../../domain/services/category-detector.service.js";
import { mapLimit } from "../../../../utils/mapLimit.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeProduct(
  p: RawSelfConsumptionProduct,
  catalog: Parameters<typeof detectCategory>[1],
): VendusSelfConsumptionProduct | null {
  const qty = toNum(p.qty ?? p.quantity ?? 1);
  if (qty <= 0) return null;
  const reference = String(p.reference ?? "").trim();
  const title = String(p.title ?? p.name ?? "").trim() || reference || "(sem nome)";
  const category = detectCategory({ reference, title }, catalog);
  return { reference, title, qty, category };
}

function needsDetailFetch(r: RawSelfConsumptionRecord): boolean {
  return !Array.isArray(r.products) || r.products.length === 0;
}

// ─── Analytics computation ─────────────────────────────────────────────────────

function computeAnalytics(records: VendusSelfConsumptionRecord[]): VendusSelfConsumptionAnalytics {
  let totalSpending = 0;
  let totalItemsConsumed = 0;
  const employeeMap = new Map<string, { recordCount: number; totalSpending: number }>();
  const categoryMap = new Map<VendusCategory, number>();
  const productMap = new Map<string, VendusSelfConsumptionTopProduct>();

  for (const r of records) {
    totalSpending += r.totalSpending;

    const emp = employeeMap.get(r.employeeName) ?? { recordCount: 0, totalSpending: 0 };
    emp.recordCount++;
    emp.totalSpending += r.totalSpending;
    employeeMap.set(r.employeeName, emp);

    for (const p of r.products) {
      totalItemsConsumed += p.qty;

      categoryMap.set(p.category, (categoryMap.get(p.category) ?? 0) + p.qty);

      const key = p.reference || `title:${p.title}`;
      const existing = productMap.get(key);
      if (existing) {
        existing.qty += p.qty;
      } else {
        productMap.set(key, { reference: p.reference, title: p.title, category: p.category, qty: p.qty });
      }
    }
  }

  const byEmployee: VendusSelfConsumptionByEmployee[] = Array.from(employeeMap.entries())
    .map(([employeeName, acc]) => ({
      employeeName,
      recordCount: acc.recordCount,
      totalSpending: round2(acc.totalSpending),
    }))
    .sort((a, b) => b.totalSpending - a.totalSpending);

  const byCategory: VendusSelfConsumptionByCategory[] = Array.from(categoryMap.entries())
    .map(([category, qty]) => ({ category, qty }))
    .sort((a, b) => b.qty - a.qty);

  const topProducts: VendusSelfConsumptionTopProduct[] = Array.from(productMap.values())
    .sort((a, b) => b.qty - a.qty);

  return {
    totalSpending: round2(totalSpending),
    recordCount: records.length,
    totalItemsConsumed,
    byEmployee,
    byCategory,
    topProducts,
  };
}

// ─── Use case ──────────────────────────────────────────────────────────────────

export class GetSelfConsumptionUseCase implements GetSelfConsumptionPort {
  constructor(
    private readonly gateway: VendusGatewayPort,
    private readonly productCatalog: VendusProductCatalogPort,
    private readonly concurrency: number,
  ) {}

  async execute(params: GetSelfConsumptionParams): Promise<VendusSelfConsumptionResult> {
    const { since, until } = params;

    // 1. Catalog + all records in parallel
    const [catalog, rawRecords] = await Promise.all([
      this.productCatalog.getProducts(),
      this.fetchAllPages(since, until),
    ]);

    // 2. Fetch detail for records that lack products
    const needingFetch = rawRecords
      .filter(needsDetailFetch)
      .map((r) => r.id)
      .filter((id): id is string | number => id != null);

    const detailMap = new Map<string | number, RawSelfConsumptionProduct[]>();
    await mapLimit(needingFetch, this.concurrency, async (id) => {
      try {
        detailMap.set(id, await this.gateway.fetchSelfConsumptionDetail(id));
      } catch {
        detailMap.set(id, []);
      }
    });

    // 3. Normalize records
    const records: VendusSelfConsumptionRecord[] = rawRecords
      .map((r): VendusSelfConsumptionRecord => {
        const rawProducts = (Array.isArray(r.products) && r.products.length > 0)
          ? r.products
          : (r.id != null ? (detailMap.get(r.id) ?? []) : []);

        const products = rawProducts
          .map((p) => normalizeProduct(p, catalog))
          .filter((p): p is VendusSelfConsumptionProduct => p !== null);

        return {
          id: r.id ?? 0,
          datetime: r.consumption_datetime ?? "",
          employeeName: r.employee_name ?? "—",
          totalSpending: round2(toNum(r.total)),
          observations: r.observations ?? "",
          products,
        };
      })
      .sort((a, b) => b.datetime.localeCompare(a.datetime));

    return { records, analytics: computeAnalytics(records) };
  }

  private async fetchAllPages(since: string, until: string): Promise<RawSelfConsumptionRecord[]> {
    const all: RawSelfConsumptionRecord[] = [];
    let page = 1;

    while (true) {
      const { records, pagesCount } = await this.gateway.listSelfConsumption({
        date_start: since,
        date_end: until,
        page,
      });
      all.push(...records);
      if (page >= pagesCount || page >= 500) break;
      page++;
    }

    return all;
  }
}
