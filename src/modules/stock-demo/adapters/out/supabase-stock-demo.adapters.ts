import { mintOrganizationId, type OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { findStockDemoByDemoOrg, STOCK_DEMO_COLUMNS, type StockDemoRow } from "../../../../infra/scoped-db/stock-demo-organization.js";
import { isStockDemoScenario, type PosProduct, type StockDemoLink, type StockDemoScenario } from "../../domain/entities/stock-demo.js";
import type { PosCatalogReadPort, StockDemoRepositoryPort } from "../../domain/ports/out/stock-demo.ports.js";

function toLink(r: StockDemoRow): StockDemoLink | null {
  if (!isStockDemoScenario(r.scenario)) return null;
  return {
    realOrgId: mintOrganizationId(r.org_id),
    scenario: r.scenario,
    demoOrgId: mintOrganizationId(r.demo_org_id),
    seed: Number(r.seed),
    monthlySalesTargetCents: Number(r.monthly_sales_target_cents),
    posName: r.pos_name,
    posApiKeyHint: r.pos_api_key_hint,
    createdAt: r.created_at,
  };
}

export class SupabaseStockDemoRepository implements StockDemoRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async listForRealOrg(realOrg: OrganizationId): Promise<StockDemoLink[]> {
    const { data, error } = await this.scopedQuery(realOrg).table("stock_demo_organizations").select(STOCK_DEMO_COLUMNS);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as StockDemoRow[]).map(toLink).filter((l): l is StockDemoLink => l !== null);
  }

  async findByScenario(realOrg: OrganizationId, scenario: StockDemoScenario): Promise<StockDemoLink | null> {
    const { data, error } = await this.scopedQuery(realOrg).table("stock_demo_organizations").select(STOCK_DEMO_COLUMNS).eq("scenario", scenario).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toLink(data as unknown as StockDemoRow) : null;
  }

  async findByDemoOrg(demoOrg: OrganizationId): Promise<StockDemoLink | null> {
    const row = await findStockDemoByDemoOrg(demoOrg);
    return row ? toLink(row) : null;
  }
}

const SIZE_LABEL: Record<string, string> = { xs: "XS", small: "Individual", large: "Grande" };

/** Pratos ativos mapeados por referência, com o PVP de cada variante, na organização de demonstração. */
export class SupabasePosCatalogRead implements PosCatalogReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async listProducts(demoOrg: OrganizationId): Promise<PosProduct[]> {
    const q = this.scopedQuery(demoOrg);
    const [maps, prices, dishes] = await Promise.all([
      q.table("vendus_product_mapping").select("match_value, pizza_id, pizza_size").eq("match_by", "reference").eq("target_type", "pizza"),
      q.table("pizza_prices").select("pizza_id, size, price"),
      q.table("pizzas").select("id, name, is_active"),
    ]);
    for (const r of [maps, prices, dishes]) if (r.error) throw new Error(r.error.message);
    const priceOf = new Map(((prices.data ?? []) as unknown as { pizza_id: string; size: string; price: number }[]).map((p) => [`${p.pizza_id}:${p.size}`, Number(p.price)]));
    const dishOf = new Map(((dishes.data ?? []) as unknown as { id: string; name: string; is_active: boolean }[]).map((d) => [d.id, d]));
    const out: PosProduct[] = [];
    for (const m of (maps.data ?? []) as unknown as { match_value: string; pizza_id: string; pizza_size: string }[]) {
      const dish = dishOf.get(m.pizza_id);
      const price = priceOf.get(`${m.pizza_id}:${m.pizza_size}`);
      if (!dish?.is_active || price == null || price <= 0) continue;
      out.push({ reference: m.match_value, title: `${dish.name} (${SIZE_LABEL[m.pizza_size] ?? m.pizza_size})`, pizzaId: m.pizza_id, size: m.pizza_size, priceCents: Math.round(price * 100) });
    }
    return out;
  }
}
