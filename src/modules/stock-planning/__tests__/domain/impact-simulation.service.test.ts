import { simulateImpact, type ConsumptionContribution } from "../../domain/services/impact-simulation.service.js";

describe("simulateImpact", () => {
  it("agrupa contribuições por fonte de procura distinta, sem dupla contagem", () => {
    // Preparo partilhado por duas pizzas — cada uma contribui a sua própria parte para o mesmo item de stock.
    const contributions: ConsumptionContribution[] = [
      { demandSourceType: "pizza", demandSourceRef: "pizza-a:small", stockItemId: "farinha", contributedQty: 10 },
      { demandSourceType: "pizza", demandSourceRef: "pizza-b:large", stockItemId: "farinha", contributedQty: 15 },
      { demandSourceType: "stock", demandSourceRef: "outro-item", stockItemId: "outro-item", contributedQty: 99 },
    ];

    const result = simulateImpact("farinha", contributions);
    expect(result).toHaveLength(2);
    expect(result.reduce((sum, r) => sum + r.contributedQty, 0)).toBe(25);
    expect(result[0]?.contributedQty).toBe(15); // ordenado desc
  });

  it("sem contribuições para o item, devolve lista vazia", () => {
    expect(simulateImpact("item-x", [])).toEqual([]);
  });

  it("múltiplas entradas da mesma fonte no mesmo item somam corretamente (nunca duplicam a fonte)", () => {
    const contributions: ConsumptionContribution[] = [
      { demandSourceType: "pizza", demandSourceRef: "pizza-a:small", stockItemId: "farinha", contributedQty: 5 },
      { demandSourceType: "pizza", demandSourceRef: "pizza-a:small", stockItemId: "farinha", contributedQty: 3 },
    ];
    const result = simulateImpact("farinha", contributions);
    expect(result).toHaveLength(1);
    expect(result[0]?.contributedQty).toBe(8);
  });
});
