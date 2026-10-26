import type { RecipeLine } from "../entities/recipe-costing.js";
import type {
  IngredientInfo,
  PreparationVersion,
  RecipeVersion,
  WeeklyDishCost,
  WeeklyDishCostPoint,
  WeeklyLineCost,
  WeeklyPriceSource,
} from "../entities/weekly-dish-cost.js";
import { weekEndIso, weeksUntil } from "./price-history.service.js";
import { preparationFactor } from "./recipe-cost.service.js";

const SIZE_ORDER = ["small", "large"];
const SOURCE_RANK: Record<WeeklyPriceSource, number> = { purchase: 0, carried: 1, manual: 2, none: 3 };
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Versão em vigor no fim da semana (a última com início antes do fim da semana). */
function inForce<T extends { effectiveFrom: string }>(versions: T[], endIso: string): T | null {
  let found: T | null = null;
  for (const v of versions) if (v.effectiveFrom < endIso && (!found || v.effectiveFrom >= found.effectiveFrom)) found = v;
  return found;
}

/** Preço do ingrediente na semana `i` (cêntimos por unidade base) e a sua origem. */
function priceAt(info: IngredientInfo | undefined, i: number): { cents: number | null; source: WeeklyPriceSource } {
  const w = info?.weeks[i];
  if (w?.avgCentsPerUnit != null) return { cents: w.avgCentsPerUnit, source: "purchase" };
  if (w?.carriedCentsPerUnit != null) return { cents: w.carriedCentsPerUnit, source: "carried" };
  if (info?.manualCentsPerUnit != null && info.manualCentsPerUnit > 0) return { cents: info.manualCentsPerUnit, source: "manual" };
  return { cents: null, source: "none" };
}

export interface WeeklyDishCostInput {
  pizzaId: string;
  name: string;
  versions: RecipeVersion[];
  preparations: Map<string, PreparationVersion[]>;
  ingredients: Map<string, IngredientInfo>;
  today: string;
  weeks: number;
}

/**
 * Custo teórico semanal por tamanho (V5 §6.1): para cada semana, a versão da ficha em vigor (e dos
 * preparos) × o preço de referência da semana de cada ingrediente (média ponderada das compras; sem
 * compra, o último preço transportado; sem nenhuma compra, o custo manual assinalado). Ingrediente sem
 * preço → custo incompleto, nunca zero. Sem versão → «sem versão histórica». Precisão total até ao fim.
 */
export function weeklyDishCost(input: WeeklyDishCostInput): WeeklyDishCost {
  const weeks = weeksUntil(input.today, input.weeks);
  const sizes = [...new Set(input.versions.flatMap((v) => v.lines.map((l) => l.size)))].sort(
    (a, b) => (SIZE_ORDER.indexOf(a) + 1 || 99) - (SIZE_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b),
  );
  const firstVersionAt = input.versions.reduce<string | null>((m, v) => (m === null || v.effectiveFrom < m ? v.effectiveFrom : m), null);

  return {
    pizzaId: input.pizzaId,
    name: input.name,
    firstVersionAt,
    sizes: sizes.map((size) => {
      const points: WeeklyDishCostPoint[] = weeks.map((w, i) => {
        const end = weekEndIso(w.weekStart);
        const version = inForce(input.versions, end);
        if (!version) return { ...w, status: "no_version", versionFrom: null, costWithoutVat: null, changeRatio: null, lines: [] };
        const raw = version.lines.filter((l) => l.size === size).map((l) => lineCost(l, i, end, input));
        const complete = raw.every((l) => l.complete);
        // Soma com a precisão total; só o resultado (e cada linha mostrada) é arredondado.
        const cost = raw.reduce((s, l) => s + l.costWithoutVat, 0);
        const lines = raw.map((l) => ({ ...l, costWithoutVat: round4(l.costWithoutVat) }));
        return { ...w, status: complete ? "ok" : "incomplete", versionFrom: version.effectiveFrom, costWithoutVat: round4(cost), changeRatio: null, lines };
      });
      let previous: number | null = null;
      for (const p of points) {
        if (p.status === "ok" && p.costWithoutVat !== null) {
          p.changeRatio = previous ? p.costWithoutVat / previous - 1 : null;
          previous = p.costWithoutVat;
        }
      }
      return { size, weeks: points };
    }),
  };
}

function lineCost(line: RecipeLine, weekIndex: number, weekEnd: string, input: WeeklyDishCostInput): WeeklyLineCost {
  const waste = 1 + (line.wasteFactor ?? 0);
  if (line.stockItemId) {
    const info = input.ingredients.get(line.stockItemId);
    const { cents, source } = priceAt(info, weekIndex);
    return {
      stockItemId: line.stockItemId,
      preparationId: null,
      name: info?.name ?? "",
      quantity: line.quantity,
      baseUnit: info?.baseUnit ?? null,
      costWithoutVat: cents === null ? 0 : (line.quantity * waste * cents) / 100,
      source,
      complete: cents !== null,
    };
  }
  const prep = line.preparationId ? inForce(input.preparations.get(line.preparationId) ?? [], weekEnd) : null;
  if (!prep) {
    return { stockItemId: null, preparationId: line.preparationId, name: "", quantity: line.quantity, baseUnit: null, costWithoutVat: 0, source: "none", complete: false };
  }
  const factor = preparationFactor(prep.definition, line.quantity);
  let cost = 0;
  let source: WeeklyPriceSource = "purchase";
  let complete = prep.definition.items.length > 0;
  for (const item of prep.definition.items) {
    const { cents, source: s } = priceAt(input.ingredients.get(item.stockItemId), weekIndex);
    if (SOURCE_RANK[s] > SOURCE_RANK[source]) source = s;
    if (cents === null) {
      complete = false;
      continue;
    }
    cost += (item.quantity * factor * waste * cents) / 100;
  }
  return { stockItemId: null, preparationId: prep.definition.id, name: prep.definition.name, quantity: line.quantity, baseUnit: null, costWithoutVat: cost, source, complete };
}
