import {
  detectCategoryFromId,
  detectCategoryFromTitle,
  detectCategory,
} from "../../domain/services/category-detector.service.js";
import type { VendusProduct } from "../../domain/entities/vendus-product.js";

function makeProduct(reference: string, title: string, category: VendusProduct["category"]): VendusProduct {
  return { id: 1, reference, title, category_id: 0, category, salaoPrice: null, eatzPrice: null };
}

// ─── detectCategoryFromId ─────────────────────────────────────────────────────

describe("detectCategoryFromId", () => {
  it.each([
    [278665754, "pizza"],
    [278665355, "pizza"],
    [278665776, "pizza"],
    [278665677, "pizza"],
  ])("returns 'pizza' for ID %d", (id, expected) => {
    expect(detectCategoryFromId(id)).toBe(expected);
  });

  it("returns 'bebida_nao_alcoolica' for known non-alcoholic ID", () => {
    expect(detectCategoryFromId(277326048)).toBe("bebida_nao_alcoolica");
  });

  it.each([
    [278667084],
    [278665808],
  ])("returns 'bebida_alcoolica' for ID %d", (id) => {
    expect(detectCategoryFromId(id)).toBe("bebida_alcoolica");
  });

  it("returns 'sacos' for known bag ID", () => {
    expect(detectCategoryFromId(275975456)).toBe("sacos");
  });

  it.each([
    [290966863],
    [290972068],
  ])("returns 'outros' for ID %d", (id) => {
    expect(detectCategoryFromId(id)).toBe("outros");
  });

  it("returns null for unknown ID", () => {
    expect(detectCategoryFromId(999999999)).toBeNull();
  });
});

// ─── detectCategoryFromTitle ──────────────────────────────────────────────────

describe("detectCategoryFromTitle", () => {
  it.each([
    ["Honey Pepperoni (Individual)"],
    ["Margherita (Grande)"],
  ])("detects 'pizza' from title '%s'", (title) => {
    expect(detectCategoryFromTitle(title)).toBe("pizza");
  });

  it.each([
    ["Embalagem Take-Away"],
    ["Taxa de Saco"],
    ["Saco reutilizável"],
  ])("detects 'sacos' from title '%s'", (title) => {
    expect(detectCategoryFromTitle(title)).toBe("sacos");
  });

  it.each([
    ["Cerveja Imperial 33cl"],
    ["San Miguel garrafa"],
    ["Vinho tinto da casa"],
    ["Sangria"],
    ["Maestra 5l"],
  ])("detects 'bebida_alcoolica' from title '%s'", (title) => {
    expect(detectCategoryFromTitle(title)).toBe("bebida_alcoolica");
  });

  it.each([
    ["Coca-Cola"],
    ["Ice Tea Lipton"],
    ["Água Solan"],
    ["Agua mineral"],
    ["Seven Up lata"],
    ["Sumo de laranja"],
  ])("detects 'bebida_nao_alcoolica' from title '%s'", (title) => {
    expect(detectCategoryFromTitle(title)).toBe("bebida_nao_alcoolica");
  });

  it("falls back to 'outros' for unrecognised title", () => {
    expect(detectCategoryFromTitle("Produto desconhecido")).toBe("outros");
  });

  it("is case-insensitive", () => {
    expect(detectCategoryFromTitle("CERVEJA")).toBe("bebida_alcoolica");
    expect(detectCategoryFromTitle("honey pepperoni (grande)")).toBe("pizza");
  });
});

// ─── detectCategory ───────────────────────────────────────────────────────────

describe("detectCategory", () => {
  let catalog: Map<string, VendusProduct>;

  beforeEach(() => {
    catalog = new Map([
      ["anb-001", makeProduct("ANB-001", "Honey Pepperoni (Grande)", "pizza")],
      ["title:coca-cola", makeProduct("", "Coca-Cola", "bebida_nao_alcoolica")],
    ]);
  });

  it("returns category by normalised reference when found in catalog", () => {
    expect(detectCategory({ reference: "ANB-001", title: "Irrelevant" }, catalog)).toBe("pizza");
  });

  it("reference lookup is case-insensitive", () => {
    expect(detectCategory({ reference: "anb-001", title: "Irrelevant" }, catalog)).toBe("pizza");
    expect(detectCategory({ reference: "ANB-001", title: "Irrelevant" }, catalog)).toBe("pizza");
  });

  it("falls back to title lookup in catalog when reference is empty", () => {
    expect(detectCategory({ reference: "", title: "Coca-Cola" }, catalog)).toBe("bebida_nao_alcoolica");
  });

  it("falls back to title lookup in catalog when reference is not found", () => {
    expect(detectCategory({ reference: "UNKNOWN", title: "Coca-Cola" }, catalog)).toBe("bebida_nao_alcoolica");
  });

  it("falls back to title heuristic when neither reference nor title is in catalog", () => {
    expect(detectCategory({ reference: "UNKNOWN", title: "Honey Pepperoni (Grande)" }, catalog)).toBe("pizza");
  });

  it("returns 'outros' when nothing matches at all", () => {
    expect(detectCategory({ reference: "UNKNOWN", title: "Produto sem categoria" }, catalog)).toBe("outros");
  });
});
