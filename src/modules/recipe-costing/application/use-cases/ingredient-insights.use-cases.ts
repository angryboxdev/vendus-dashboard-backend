import type { IngredientInfo } from "../../domain/entities/weekly-dish-cost.js";
import type {
  DishesImpactDTO,
  GetDishesImpactPort,
  GetIngredientUsagePort,
  GetIngredientsCostOverviewPort,
  IngredientsCostOverviewDTO,
} from "../../domain/ports/in/ingredient-insights.port.js";
import type { DishWeeklyCostReadPort } from "../../domain/ports/out/dish-weekly-cost-read.port.js";
import type { PurchaseObservationReadPort } from "../../domain/ports/out/purchase-observation-read.port.js";
import type { RecipeCostingReadPort } from "../../domain/ports/out/recipe-costing-read.port.js";
import { IMPACT_METHOD, dishImpact } from "../../domain/services/dish-impact.service.js";
import { REFERENCE_METHOD, ingredientCostOverview } from "../../domain/services/ingredient-overview.service.js";
import { ingredientUsage, type IngredientUsage } from "../../domain/services/ingredient-usage.service.js";
import { weeklyPriceHistory, weeksUntil } from "../../domain/services/price-history.service.js";

const lisbonToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
const clamp = (n: number | undefined, def: number, max: number) => Math.min(max, Math.max(1, Math.round(n ?? def)));

/** Resumo de custos por ingrediente (V6 §6): uma leitura das compras confirmadas, sem N+1. */
export class GetIngredientsCostOverviewUseCase implements GetIngredientsCostOverviewPort {
  constructor(
    private readonly purchases: PurchaseObservationReadPort,
    private readonly today: () => string = lisbonToday,
  ) {}

  async execute(command: { organizationId: Parameters<PurchaseObservationReadPort["listAll"]>[0]; weeks?: number }): Promise<IngredientsCostOverviewDTO> {
    const weeks = clamp(command.weeks, 12, 52);
    const today = this.today();
    const all = await this.purchases.listAll(command.organizationId);
    return {
      referenceMethod: REFERENCE_METHOD,
      weeks: weeksUntil(today, weeks).map((w) => w.week),
      items: [...all.entries()].map(([id, obs]) => ingredientCostOverview(id, obs, today, weeks)),
    };
  }
}

/** Fichas técnicas que usam um ingrediente (V6 §7 «Fichas técnicas»), pelo custo atual das fichas. */
export class GetIngredientUsageUseCase implements GetIngredientUsagePort {
  constructor(
    private readonly snapshotRead: RecipeCostingReadPort,
    private readonly purchases: PurchaseObservationReadPort,
  ) {}

  async execute(command: { organizationId: Parameters<RecipeCostingReadPort["loadSnapshot"]>[0]; stockItemId: string }): Promise<IngredientUsage[] | null> {
    const item = await this.purchases.findItem(command.organizationId, command.stockItemId);
    if (!item) return null;
    return ingredientUsage(await this.snapshotRead.loadSnapshot(command.organizationId), command.stockItemId);
  }
}

/** Impacto do preço dos ingredientes nas pizzas (V6 §8): ficha atual × preços de agora e de há N semanas. */
export class GetDishesImpactUseCase implements GetDishesImpactPort {
  constructor(
    private readonly read: DishWeeklyCostReadPort,
    private readonly purchases: PurchaseObservationReadPort,
    private readonly today: () => string = lisbonToday,
  ) {}

  async execute(command: { organizationId: Parameters<DishWeeklyCostReadPort["listPizzas"]>[0]; compareWeeks?: number }): Promise<DishesImpactDTO> {
    const org = command.organizationId;
    const compare = clamp(command.compareWeeks, 4, 52);
    const today = this.today();
    const weeks = weeksUntil(today, compare + 1);
    const [pizzas, versions, observations] = await Promise.all([this.read.listPizzas(org), this.read.listLatestPizzaVersions(org), this.purchases.listAll(org)]);
    const prepIds = [...new Set([...versions.values()].flatMap((v) => v.lines.map((l) => l.preparationId).filter((id): id is string => !!id)))];
    const prepVersions = await this.read.listPreparationVersions(org, prepIds);
    const preparations = [...prepVersions.values()].map((vs) => vs[vs.length - 1]!.definition);
    const itemIds = [
      ...new Set([
        ...[...versions.values()].flatMap((v) => v.lines.map((l) => l.stockItemId).filter((id): id is string => !!id)),
        ...preparations.flatMap((p) => p.items.map((i) => i.stockItemId)),
      ]),
    ];
    const items = await this.read.listIngredients(org, itemIds);
    const ingredients = new Map<string, IngredientInfo>();
    for (const id of itemIds) {
      const info = items.get(id);
      if (info) ingredients.set(id, { ...info, weeks: weeklyPriceHistory(observations.get(id) ?? [], today, weeks.length) });
    }
    return {
      method: IMPACT_METHOD,
      now: weeks[weeks.length - 1]!,
      then: weeks[0]!,
      dishes: pizzas.flatMap((p) => {
        const v = versions.get(p.id);
        if (!v || v.lines.length === 0) return [];
        return [{
          pizzaId: p.id,
          name: p.name,
          category: p.category,
          isActive: p.isActive,
          versionFrom: v.effectiveFrom,
          sizes: dishImpact({ lines: v.lines, preparations, ingredients, weeks, nowIndex: weeks.length - 1, thenIndex: 0 }),
        }];
      }),
    };
  }
}
