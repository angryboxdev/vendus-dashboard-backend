import type { PreparationDefinition, RecipeLine } from "../entities/recipe-costing.js";
import type { IngredientInfo, PreparationVersion, WeeklyPriceSource } from "../entities/weekly-dish-cost.js";
import { lineCost } from "./weekly-dish-cost.service.js";

/**
 * Impacto do preço dos ingredientes no custo teórico das pizzas (task V6 §8). Método: a ficha atual
 * (mesma versão) aplicada aos preços de referência de cada semana — isola o efeito do preço, sem
 * misturar alterações de receita. É reconstruído (não um snapshot fechado) e é dito como tal.
 */
export const IMPACT_METHOD = "Ficha técnica atual aplicada aos preços de compra de cada semana (reconstruído)";

export interface ImpactLine {
  name: string;
  stockItemId: string | null;
  preparationId: string | null;
  quantity: number;
  baseUnit: string | null;
  nowCost: number;
  thenCost: number;
  /** nowCost − thenCost, € s/ IVA (a soma das linhas dá a variação total). */
  diff: number;
  nowSource: WeeklyPriceSource;
  thenSource: WeeklyPriceSource;
  complete: boolean;
}

export interface DishSizeImpact {
  size: string;
  now: { week: string; costWithoutVat: number; complete: boolean };
  then: { week: string; costWithoutVat: number; complete: boolean };
  /** Só com as duas semanas completas (todos os ingredientes com preço). */
  comparable: boolean;
  change: number | null;
  changeRatio: number | null;
  /** Ingrediente/preparo com a maior variação absoluta. */
  mainFactor: { name: string; diff: number } | null;
  lines: ImpactLine[];
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const EPOCH = "1970-01-01T00:00:00.000Z";

export interface DishImpactInput {
  lines: RecipeLine[];
  preparations: PreparationDefinition[];
  ingredients: Map<string, IngredientInfo>;
  weeks: { week: string; weekStart: string }[];
  /** Índices em `weeks` da semana atual e da semana de comparação. */
  nowIndex: number;
  thenIndex: number;
}

export function dishImpact(input: DishImpactInput): DishSizeImpact[] {
  // A ficha atual vale para as duas semanas (mesma versão): os preparos atuais também.
  const preps = new Map<string, PreparationVersion[]>(input.preparations.map((p) => [p.id, [{ effectiveFrom: EPOCH, definition: p }]]));
  const ctx = { preparations: preps, ingredients: input.ingredients };
  const far = "9999-12-31T00:00:00.000Z";
  const rank = (x: string) => { const i = ["xs", "small", "large"].indexOf(x); return i === -1 ? 3 : i; };
  const sizes = [...new Set(input.lines.map((l) => l.size))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return sizes.map((size) => {
    const lines = input.lines.filter((l) => l.size === size).map((l): ImpactLine => {
      const now = lineCost(l, input.nowIndex, far, ctx);
      const then = lineCost(l, input.thenIndex, far, ctx);
      return {
        name: now.name,
        stockItemId: now.stockItemId,
        preparationId: now.preparationId,
        quantity: now.quantity,
        baseUnit: now.baseUnit,
        nowCost: now.costWithoutVat,
        thenCost: then.costWithoutVat,
        diff: now.costWithoutVat - then.costWithoutVat,
        nowSource: now.source,
        thenSource: then.source,
        complete: now.complete && then.complete,
      };
    });
    const nowCost = lines.reduce((s, l) => s + l.nowCost, 0);
    const thenCost = lines.reduce((s, l) => s + l.thenCost, 0);
    const nowComplete = lines.every((l) => l.nowSource !== "none");
    const thenComplete = lines.every((l) => l.thenSource !== "none");
    const comparable = nowComplete && thenComplete && lines.length > 0;
    const top = comparable ? [...lines].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0] : undefined;
    return {
      size,
      now: { week: input.weeks[input.nowIndex]!.week, costWithoutVat: round4(nowCost), complete: nowComplete },
      then: { week: input.weeks[input.thenIndex]!.week, costWithoutVat: round4(thenCost), complete: thenComplete },
      comparable,
      change: comparable ? round4(nowCost - thenCost) : null,
      changeRatio: comparable && thenCost > 0 ? nowCost / thenCost - 1 : null,
      mainFactor: top && Math.abs(top.diff) >= 0.00005 ? { name: top.name, diff: round4(top.diff) } : null,
      lines: lines.map((l) => ({ ...l, nowCost: round4(l.nowCost), thenCost: round4(l.thenCost), diff: round4(l.diff) })),
    };
  });
}
