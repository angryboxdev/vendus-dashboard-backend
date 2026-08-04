import { GetDocumentDetailUseCase } from "../../application/use-cases/get-document-detail.use-case.js";
import { FakeVendusGateway } from "../fakes/fake-vendus-gateway.js";
import { FakeProductCatalog } from "../fakes/fake-product-catalog.js";
import type { VendusDetailedDocumentRaw } from "../../domain/entities/vendus-document.js";
import type { VendusProduct } from "../../domain/entities/vendus-product.js";

const EATZ_ID = 275787588;

function makeDetailDoc(id: number, overrides: Partial<VendusDetailedDocumentRaw> = {}): VendusDetailedDocumentRaw {
  return {
    id,
    type: "FS",
    number: `FS 1/${id}`,
    date: "2026-08-01",
    system_time: "2026-08-01 13:00:00",
    amount_gross: "10.00",
    amount_net: "8.85",
    taxes: [],
    discounts: { total: "0.00" },
    payments: [{ id: 999, title: "Multibanco", amount: "10.00" }],
    client: { name: "", fiscal_id: "" },
    items: [
      { id: 1, qty: 1, title: "Honey Pepperoni (Grande)", reference: "ANB-001",
        amounts: { gross_total: "10.00" }, discounts: {}, tax: { rate: 13 } },
    ],
    related_docs: null,
    store_id: 1,
    register_id: 1,
    ...overrides,
  };
}

function makeProduct(reference: string, title: string, category: VendusProduct["category"]): VendusProduct {
  return { id: 1, reference, title, category_id: 0, category, salaoPrice: null, eatzPrice: null };
}

describe("GetDocumentDetailUseCase", () => {
  let gateway: FakeVendusGateway;
  let catalog: FakeProductCatalog;
  let useCase: GetDocumentDetailUseCase;

  beforeEach(() => {
    gateway = new FakeVendusGateway();
    catalog = new FakeProductCatalog();
    useCase = new GetDocumentDetailUseCase(gateway, catalog, EATZ_ID);
  });

  // ─── Channel ──────────────────────────────────────────────────────────────────

  it("assigns 'eatz' channel when eatz payment is present", async () => {
    gateway.setDetail(1, makeDetailDoc(1, {
      payments: [{ id: EATZ_ID, title: "Eatz", amount: "10.00" }],
    }));

    const result = await useCase.execute(1);

    expect(result.channel).toBe("eatz");
  });

  it("assigns 'salao' channel for non-eatz payment without embalagem", async () => {
    gateway.setDetail(1, makeDetailDoc(1));

    const result = await useCase.execute(1);

    expect(result.channel).toBe("salao");
  });

  it("assigns 'take_away' when non-eatz payment with embalagem item", async () => {
    gateway.setDetail(1, makeDetailDoc(1, {
      items: [
        { id: 1, qty: 1, title: "Honey Pepperoni (Grande)", reference: "",
          amounts: {}, discounts: {}, tax: {} },
        { id: 2, qty: 1, title: "Embalagem Take-Away", reference: "",
          amounts: {}, discounts: {}, tax: {} },
      ],
    }));

    const result = await useCase.execute(1);

    expect(result.channel).toBe("take_away");
  });

  // ─── has_drinks ───────────────────────────────────────────────────────────────

  it("has_drinks is true when item title matches bebida_alcoolica heuristic", async () => {
    gateway.setDetail(1, makeDetailDoc(1, {
      items: [
        { id: 1, qty: 1, title: "Honey Pepperoni (Grande)", reference: "",
          amounts: {}, discounts: {}, tax: {} },
        { id: 2, qty: 1, title: "Vinho tinto da casa", reference: "",
          amounts: {}, discounts: {}, tax: {} },
      ],
    }));

    const result = await useCase.execute(1);

    expect(result.has_drinks).toBe(true);
  });

  it("has_drinks is true when item title matches bebida_nao_alcoolica heuristic", async () => {
    gateway.setDetail(1, makeDetailDoc(1, {
      items: [
        { id: 1, qty: 1, title: "Coca-Cola", reference: "",
          amounts: {}, discounts: {}, tax: {} },
      ],
    }));

    const result = await useCase.execute(1);

    expect(result.has_drinks).toBe(true);
  });

  it("has_drinks is false when no drink items present", async () => {
    gateway.setDetail(1, makeDetailDoc(1, {
      items: [
        { id: 1, qty: 1, title: "Honey Pepperoni (Grande)", reference: "",
          amounts: {}, discounts: {}, tax: {} },
      ],
    }));

    const result = await useCase.execute(1);

    expect(result.has_drinks).toBe(false);
  });

  it("has_drinks uses catalog reference before falling back to title heuristic", async () => {
    const catalogWithDrink = new FakeProductCatalog([
      makeProduct("DRINK-001", "Bebida da casa", "bebida_nao_alcoolica"),
    ]);
    useCase = new GetDocumentDetailUseCase(gateway, catalogWithDrink, EATZ_ID);
    // O título sozinho não dispararia a heurística, mas a reference está no catálogo
    gateway.setDetail(1, makeDetailDoc(1, {
      items: [
        { id: 1, qty: 1, title: "Bebida da casa", reference: "DRINK-001",
          amounts: {}, discounts: {}, tax: {} },
      ],
    }));

    const result = await useCase.execute(1);

    expect(result.has_drinks).toBe(true);
  });

  it("returns all raw document fields alongside the derived ones", async () => {
    gateway.setDetail(1, makeDetailDoc(1));

    const result = await useCase.execute(1);

    expect(result.id).toBe(1);
    expect(result.type).toBe("FS");
    expect(result.amount_gross).toBe("10.00");
    // derived
    expect(result.channel).toBeDefined();
    expect(result.has_drinks).toBeDefined();
  });
});
