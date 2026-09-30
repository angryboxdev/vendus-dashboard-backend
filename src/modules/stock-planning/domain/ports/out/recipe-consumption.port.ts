import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DemandSourceType, ConsumptionContribution } from "../../services/impact-simulation.service.js";

export interface DemandPredictionInput {
  demandSourceType: DemandSourceType;
  demandSourceRef: string;
  /** YYYY-MM-DD */
  date: string;
  predictedQuantity: number;
}

export interface StockConsumptionByDate {
  stockItemId: string;
  date: string;
  expectedConsumption: number;
}

export interface RecipeConsumptionResult {
  /** Agregado por item de stock + dia — usado por `stock-projection.service.ts`. */
  byStockItemAndDate: StockConsumptionByDate[];
  /** Itemizado por fonte de procura — usado por `impact-simulation.service.ts`, nunca reagregado a partir daqui (evita dupla contagem, secção 66). */
  contributions: ConsumptionContribution[];
  /** Fontes de procura vendidas sem ficha técnica/mapeamento resolvível — nunca inventa consumo, só sinaliza (secção 18). Formato `"<type>:<ref>"`. */
  incompleteDemandSources: string[];
}

/**
 * Converte previsão de vendas em consumo de ingredientes, reutilizando
 * `computeConsumptionForProductLinesLenient` (`src/services/
 * stockAdjustmentFromLinesService.ts`) — exceção deliberada e documentada
 * à regra "nunca importar serviço legacy" (ver README). Nunca reimplementa
 * a matemática de receita/preparo.
 */
export interface RecipeConsumptionPort {
  convert(organizationId: OrganizationId, predictions: DemandPredictionInput[]): Promise<RecipeConsumptionResult>;
}
