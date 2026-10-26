import type { WeeklyDishCost } from "../../domain/entities/weekly-dish-cost.js";
import type { IngredientInfo } from "../../domain/entities/weekly-dish-cost.js";
import type { GetDishWeeklyCostCommand, GetDishWeeklyCostPort } from "../../domain/ports/in/get-dish-weekly-cost.port.js";
import type { DishWeeklyCostReadPort } from "../../domain/ports/out/dish-weekly-cost-read.port.js";
import type { PurchaseObservationReadPort } from "../../domain/ports/out/purchase-observation-read.port.js";
import { weeklyPriceHistory } from "../../domain/services/price-history.service.js";
import { weeklyDishCost } from "../../domain/services/weekly-dish-cost.service.js";

/** Custo teórico semanal de uma pizza (V5 §6): só leitura, calculado a cada pedido, nunca mexe no Stock. */
export class GetDishWeeklyCostUseCase implements GetDishWeeklyCostPort {
  constructor(
    private readonly read: DishWeeklyCostReadPort,
    private readonly purchases: PurchaseObservationReadPort,
    private readonly today: () => string = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" }),
  ) {}

  async execute(command: GetDishWeeklyCostCommand): Promise<WeeklyDishCost | null> {
    const org = command.organizationId;
    const pizza = await this.read.findPizza(org, command.pizzaId);
    if (!pizza) return null;
    const weeks = Math.min(104, Math.max(1, Math.round(command.weeks ?? 12)));
    const today = this.today();
    const versions = await this.read.listPizzaVersions(org, pizza.id);
    const prepIds = [...new Set(versions.flatMap((v) => v.lines.map((l) => l.preparationId).filter((id): id is string => !!id)))];
    const preparations = await this.read.listPreparationVersions(org, prepIds);
    const itemIds = [
      ...new Set([
        ...versions.flatMap((v) => v.lines.map((l) => l.stockItemId).filter((id): id is string => !!id)),
        ...[...preparations.values()].flatMap((vs) => vs.flatMap((v) => v.definition.items.map((i) => i.stockItemId))),
      ]),
    ];
    const items = await this.read.listIngredients(org, itemIds);
    const ingredients = new Map<string, IngredientInfo>();
    await Promise.all(
      itemIds.map(async (id) => {
        const info = items.get(id);
        if (!info) return;
        const observations = await this.purchases.listForItem(org, id);
        ingredients.set(id, { ...info, weeks: weeklyPriceHistory(observations, today, weeks) });
      }),
    );
    return weeklyDishCost({ pizzaId: pizza.id, name: pizza.name, versions, preparations, ingredients, today, weeks });
  }
}
