import type { StockDemoScenario } from "../../entities/stock-demo.js";
import { BAR } from "./bar.js";
import { BRASILEIRA } from "./brasileira.js";
import { HAMBURGUERIA } from "./hamburgueria.js";
import type { ScenarioDef } from "./scenario-types.js";

export const STOCK_DEMO_SCENARIO_DEFS: Record<StockDemoScenario, ScenarioDef> = {
  brasileira: BRASILEIRA,
  hamburgueria: HAMBURGUERIA,
  bar: BAR,
};

/** Semente por omissão de cada cenário (a mesma semente dá sempre os mesmos dados). */
export const STOCK_DEMO_SEEDS: Record<StockDemoScenario, number> = { brasileira: 1107, hamburgueria: 2207, bar: 3307 };
