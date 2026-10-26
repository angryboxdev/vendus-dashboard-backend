import type { IngredientPriceHistory } from "../../domain/entities/price-history.js";
import type { GetIngredientPriceHistoryCommand, GetIngredientPriceHistoryPort } from "../../domain/ports/in/get-ingredient-price-history.port.js";
import type { PurchaseObservationReadPort } from "../../domain/ports/out/purchase-observation-read.port.js";
import { weeklyPriceHistory } from "../../domain/services/price-history.service.js";

/** Histórico semanal do preço de compra (V5 §5): só leitura, calculado a cada pedido. */
export class GetIngredientPriceHistoryUseCase implements GetIngredientPriceHistoryPort {
  constructor(
    private readonly read: PurchaseObservationReadPort,
    private readonly today: () => string = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" }),
  ) {}

  async execute(command: GetIngredientPriceHistoryCommand): Promise<IngredientPriceHistory | null> {
    const item = await this.read.findItem(command.organizationId, command.stockItemId);
    if (!item) return null;
    const observations = await this.read.listForItem(command.organizationId, command.stockItemId);
    const weeks = Math.min(104, Math.max(1, Math.round(command.weeks ?? 26)));
    const latest = [...observations].filter((o) => o.quantity > 0).sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))[0];
    return {
      stockItemId: item.id,
      name: item.name,
      baseUnit: item.baseUnit,
      weeks: weeklyPriceHistory(observations, this.today(), weeks),
      lastPurchase: latest ? { invoiceDate: latest.invoiceDate, supplierName: latest.supplierName, centsPerUnit: latest.netCents / latest.quantity } : null,
    };
  }
}
