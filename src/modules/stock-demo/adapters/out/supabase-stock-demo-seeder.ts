import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { createStockDemoOrganization, findStockDemoByDemoOrg, realOrganizationInfo } from "../../../../infra/scoped-db/stock-demo-organization.js";
import type { StockDemoLink } from "../../domain/entities/stock-demo.js";
import type { StockDemoPlan } from "../../domain/services/demo-plan.service.js";
import type { StockDemoProvisioningPort, StockDemoSeederPort } from "../../domain/ports/out/stock-demo.ports.js";

const CHUNK = 500;

/**
 * Tabelas apagadas ao recomeçar, filhas antes das mães. Só dados do Stock (e as faturas fictícias que os
 * alimentam); nunca toca noutra organização — cada `delete()` do ScopedQuery já filtra pela organização fictícia.
 */
const WIPE_ORDER = [
  "stock_movements",
  "stock_review_lines",
  "stock_review_audit_logs",
  "stock_purchase_reviews",
  "stock_review_learned_mappings",
  "invoice_allocations",
  "fiscal_document_identities",
  "invoice_audit_logs",
  "invoice_lines",
  "invoices",
  "supplier_purchase_presentations",
  "recommendation_reviews",
  "forecast_feedback",
  "replenishment_recommendations",
  "forecast_stock_requirements",
  "forecast_demand_points",
  "planning_alerts",
  "forecast_runs",
  "supplier_delivery_schedules",
  "sales_demand_actuals_daily",
  "stock_count_attempts",
  "stock_count_components",
  "stock_count_lines",
  "stock_count_sessions",
  "stock_count_zones",
  "stock_count_audit_logs",
  "stock_count_settings",
  "vendus_product_mapping",
  "pizza_recipe_items",
  "pizza_recipes",
  "pizza_prices",
  "pizzas",
  "preparation_items",
  "preparations",
  "recipe_versions",
  "stock_items",
  "stock_categories",
  "suppliers",
  "stock_entry_rules",
  "menu_costing_settings",
  "stock_settings",
] as const;

type TableName = Parameters<ReturnType<ScopedQueryFactory>["table"]>[0];

export class SupabaseStockDemoSeeder implements StockDemoSeederPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  /** Defesa em profundidade: só se escreve numa organização registada como demo do Stock. */
  private async assertStockDemo(demoOrg: OrganizationId): Promise<void> {
    if (!(await findStockDemoByDemoOrg(demoOrg))) throw new Error("Recusado: a organização não é uma demonstração do Stock.");
  }

  async ensureLocation(demoOrg: OrganizationId, name: string): Promise<string> {
    await this.assertStockDemo(demoOrg);
    const q = this.scopedQuery(demoOrg);
    const found = await q.table("locations").select("id").limit(1);
    if (found.error) throw new Error(found.error.message);
    const existing = (found.data ?? []) as unknown as { id: string }[];
    if (existing[0]) return existing[0].id;
    const created = await q.table("locations").insert({ name, code: "DEMO", is_active: true }).select("id").single();
    if (created.error) throw new Error(`Loja da demonstração: ${created.error.message}`);
    return (created.data as unknown as { id: string }).id;
  }

  async insertPlan(demoOrg: OrganizationId, plan: StockDemoPlan): Promise<void> {
    await this.assertStockDemo(demoOrg);
    const q = this.scopedQuery(demoOrg);
    for (const { table, rows } of plan.tables) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await q.table(table as TableName).insert(rows.slice(i, i + CHUNK));
        if (error) throw new Error(`Demonstração (${table}): ${error.message}`);
      }
    }
    // As versões das fichas nascem agora (triggers); na demo valem desde o início do histórico de compras,
    // para a evolução semanal do custo dos pratos ter semanas para mostrar.
    const { error } = await q.table("recipe_versions").update({ effective_from: plan.historyFrom });
    if (error) throw new Error(`Demonstração (versões das fichas): ${error.message}`);
  }

  async wipe(demoOrg: OrganizationId): Promise<void> {
    await this.assertStockDemo(demoOrg);
    const q = this.scopedQuery(demoOrg);
    for (const table of WIPE_ORDER) {
      const { error } = await q.table(table).delete();
      if (error) throw new Error(`Recomeçar demonstração (${table}): ${error.message}`);
    }
  }
}

export class SupabaseStockDemoProvisioning implements StockDemoProvisioningPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  realOrgInfo(realOrg: OrganizationId) {
    return realOrganizationInfo(realOrg);
  }

  createOrganization(input: { name: string; nif: string; timezone: string | null }) {
    return createStockDemoOrganization(input);
  }

  async insertLink(link: Omit<StockDemoLink, "createdAt"> & { createdBy: string }): Promise<void> {
    const { error } = await this.scopedQuery(link.realOrgId).table("stock_demo_organizations").insert({
      scenario: link.scenario,
      demo_org_id: link.demoOrgId,
      seed: link.seed,
      monthly_sales_target_cents: link.monthlySalesTargetCents,
      pos_name: link.posName,
      pos_api_key_hint: link.posApiKeyHint,
      created_by: link.createdBy,
    });
    if (error) throw new Error(`Ligar o cenário de demonstração: ${error.message}`);
  }
}
