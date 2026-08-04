import { GetSelfConsumptionUseCase } from "../../application/use-cases/get-selfconsumption.use-case.js";
import { FakeVendusGateway } from "../fakes/fake-vendus-gateway.js";
import { FakeProductCatalog } from "../fakes/fake-product-catalog.js";
import type { RawSelfConsumptionRecord } from "../../domain/ports/out/vendus-gateway.port.js";
import type { VendusProduct } from "../../domain/entities/vendus-product.js";

function makeRecord(
  id: number,
  employeeName: string,
  total: number,
  products?: Array<{ title?: string; reference?: string; qty?: number }>,
): RawSelfConsumptionRecord {
  return {
    id,
    employee_name: employeeName,
    consumption_datetime: `2026-08-0${id}T12:00:00`,
    total,
    observations: "",
    products: products?.map((p) => ({
      title: p.title ?? "",
      reference: p.reference ?? "",
      qty: p.qty ?? 1,
    })),
  };
}

function makeProduct(reference: string, title: string, category: VendusProduct["category"]): VendusProduct {
  return { id: 1, reference, title, category_id: 0, category, salaoPrice: null, eatzPrice: null };
}

describe("GetSelfConsumptionUseCase", () => {
  let gateway: FakeVendusGateway;
  let catalog: FakeProductCatalog;
  let useCase: GetSelfConsumptionUseCase;

  beforeEach(() => {
    gateway = new FakeVendusGateway();
    catalog = new FakeProductCatalog();
    useCase = new GetSelfConsumptionUseCase(gateway, catalog, 4);
  });

  // ─── Normalização ─────────────────────────────────────────────────────────────

  it("returns records sorted by datetime descending", async () => {
    gateway.setSelfConsumptionRecords([
      makeRecord(1, "Alice", 10, [{ title: "Água", qty: 1 }]),
      makeRecord(3, "Bob", 20, [{ title: "Água", qty: 1 }]),
      makeRecord(2, "Carol", 15, [{ title: "Água", qty: 1 }]),
    ]);

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-03" });

    expect(result.records.map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it("record with inline products does NOT trigger detail fetch", async () => {
    gateway.setSelfConsumptionRecords([
      makeRecord(1, "Alice", 10, [{ title: "Honey Pepperoni (Grande)", qty: 2 }]),
    ]);
    const fetchSpy = jest.spyOn(gateway, "fetchSelfConsumptionDetail");

    await useCase.execute({ since: "2026-08-01", until: "2026-08-01" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("record without products triggers detail fetch and uses the result", async () => {
    // products: undefined → needsDetailFetch = true
    gateway.setSelfConsumptionRecords([makeRecord(1, "Alice", 10)]);
    gateway.setSelfConsumptionDetail(1, [{ title: "Honey Pepperoni (Grande)", qty: 1 }]);

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-01" });

    expect(result.records[0]!.products).toHaveLength(1);
    expect(result.records[0]!.products[0]!.title).toBe("Honey Pepperoni (Grande)");
  });

  it("product with qty <= 0 is filtered out", async () => {
    gateway.setSelfConsumptionRecords([
      makeRecord(1, "Alice", 10, [
        { title: "Honey Pepperoni (Grande)", qty: 1 },
        { title: "Ajuste negativo", qty: 0 },
      ]),
    ]);

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-01" });

    expect(result.records[0]!.products).toHaveLength(1);
  });

  it("maps employee_name and totalSpending from raw record", async () => {
    gateway.setSelfConsumptionRecords([
      makeRecord(1, "João Silva", 12.5, [{ title: "Água", qty: 1 }]),
    ]);

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-01" });

    expect(result.records[0]!.employeeName).toBe("João Silva");
    expect(result.records[0]!.totalSpending).toBe(12.5);
  });

  it("returns empty result when no records", async () => {
    gateway.setSelfConsumptionRecords([]);

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-01" });

    expect(result.records).toHaveLength(0);
    expect(result.analytics.totalSpending).toBe(0);
    expect(result.analytics.recordCount).toBe(0);
    expect(result.analytics.totalItemsConsumed).toBe(0);
  });

  // ─── Analytics ────────────────────────────────────────────────────────────────

  it("byEmployee aggregates multiple records per employee and sorts by totalSpending desc", async () => {
    gateway.setSelfConsumptionRecords([
      makeRecord(1, "Alice", 5, [{ title: "Água", qty: 1 }]),
      makeRecord(2, "Bob", 20, [{ title: "Água", qty: 1 }]),
      makeRecord(3, "Alice", 10, [{ title: "Água", qty: 1 }]),
    ]);

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-03" });

    // Bob (20) > Alice (15) → Bob first
    expect(result.analytics.byEmployee[0]!.employeeName).toBe("Bob");
    expect(result.analytics.byEmployee[0]!.totalSpending).toBe(20);
    expect(result.analytics.byEmployee[0]!.recordCount).toBe(1);

    expect(result.analytics.byEmployee[1]!.employeeName).toBe("Alice");
    expect(result.analytics.byEmployee[1]!.totalSpending).toBe(15);
    expect(result.analytics.byEmployee[1]!.recordCount).toBe(2);
  });

  it("byCategory sums qty across all records and sorts by qty desc", async () => {
    gateway.setSelfConsumptionRecords([
      makeRecord(1, "Alice", 10, [
        { title: "Honey Pepperoni (Grande)", qty: 3 }, // → pizza (heurística)
        { title: "Água", qty: 5 },                     // → bebida_nao_alcoolica (heurística)
      ]),
    ]);

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-01" });

    // bebida_nao_alcoolica (5) > pizza (3)
    expect(result.analytics.byCategory[0]!.category).toBe("bebida_nao_alcoolica");
    expect(result.analytics.byCategory[0]!.qty).toBe(5);
    expect(result.analytics.byCategory[1]!.category).toBe("pizza");
    expect(result.analytics.byCategory[1]!.qty).toBe(3);
  });

  it("topProducts aggregates same reference across records and sorts by qty desc", async () => {
    gateway.setSelfConsumptionRecords([
      makeRecord(1, "Alice", 10, [
        { reference: "A", title: "Pizza A", qty: 2 },
        { reference: "B", title: "Pizza B", qty: 5 },
      ]),
      makeRecord(2, "Bob", 5, [
        { reference: "A", title: "Pizza A", qty: 1 }, // soma com anterior → 3
      ]),
    ]);

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-02" });

    expect(result.analytics.topProducts[0]!.reference).toBe("B");
    expect(result.analytics.topProducts[0]!.qty).toBe(5);
    expect(result.analytics.topProducts[1]!.reference).toBe("A");
    expect(result.analytics.topProducts[1]!.qty).toBe(3);
  });

  it("totalItemsConsumed sums all product quantities across all records", async () => {
    gateway.setSelfConsumptionRecords([
      makeRecord(1, "Alice", 10, [
        { title: "Água", qty: 3 },
        { title: "Honey Pepperoni (Grande)", qty: 2 },
      ]),
    ]);

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-01" });

    expect(result.analytics.totalItemsConsumed).toBe(5);
  });

  // ─── Catálogo ─────────────────────────────────────────────────────────────────

  it("uses catalog category by reference when available", async () => {
    const catalogWithProduct = new FakeProductCatalog([
      makeProduct("PIZZA-001", "Pizza Special", "pizza"),
    ]);
    const uc = new GetSelfConsumptionUseCase(gateway, catalogWithProduct, 4);
    gateway.setSelfConsumptionRecords([
      makeRecord(1, "Alice", 10, [{ reference: "PIZZA-001", title: "Qualquer título", qty: 1 }]),
    ]);

    const result = await uc.execute({ since: "2026-08-01", until: "2026-08-01" });

    expect(result.records[0]!.products[0]!.category).toBe("pizza");
  });

  it("falls back to title heuristic when reference is not in catalog", async () => {
    gateway.setSelfConsumptionRecords([
      makeRecord(1, "Alice", 10, [{ reference: "DESCONHECIDO", title: "Honey Pepperoni (Grande)", qty: 1 }]),
    ]);

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-01" });

    expect(result.records[0]!.products[0]!.category).toBe("pizza");
  });
});
