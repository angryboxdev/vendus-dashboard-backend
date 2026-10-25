import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import { confidentNameMatch, nameScore, parsePackSize, rankCandidates, suggestConversionFactor } from "../../domain/services/item-matching.service.js";
import { SuggestReviewMappingsUseCase } from "../../application/use-cases/suggest-review-mappings.use-case.js";
import { RestoreStockPurchaseReviewUseCase } from "../../application/use-cases/restore-stock-purchase-review.use-case.js";
import { ListStockPurchaseReviewsUseCase } from "../../application/use-cases/list-stock-purchase-reviews.use-case.js";
import { ReviewNotCancelledError } from "../../domain/errors.js";
import type { StockItemMatchAiLine, StockItemMatchAiPort, StockItemMatchAiResult } from "../../domain/ports/out/stock-item-match-ai.port.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";
import { FakeStockCatalogWrite } from "../fakes/fake-stock-catalog-write.js";
import { FakeStockReviewLearnedMapping } from "../fakes/fake-stock-review-learned-mapping.js";
import { FakeStockReviewAuditLog } from "../fakes/fake-stock-review-audit-log.js";

const ORG = mintOrganizationId("org-test");

const CATALOG = [
  { id: "farinha", name: "Farinha T65", baseUnit: "kg", isActive: true },
  { id: "mozz", name: "Mozzarella fior di latte", baseUnit: "kg", isActive: true },
  { id: "agua", name: "Água sem gás 1,5L", baseUnit: "un", isActive: true },
  { id: "coca", name: "Coca-Cola lata", baseUnit: "un", isActive: true },
  { id: "azeite", name: "Azeite virgem extra", baseUnit: "l", isActive: true },
  { id: "tomate", name: "Tomate pelado", baseUnit: "kg", isActive: true },
];

describe("F3b — conciliação por nome e embalagem (domínio)", () => {
  test("nome: descrição da fatura com marca/abreviaturas encontra o artigo; artigos diferentes ficam abaixo", () => {
    expect(nameScore("FARINHA T65 CEREALIS 25KG", "Farinha T65")).toBeGreaterThanOrEqual(0.75);
    expect(nameScore("MOZZARELLA FIOR DI LATTE 1KG", "Mozzarella fior di latte")).toBeGreaterThanOrEqual(0.9);
    expect(nameScore("FARINHA T65 CEREALIS 25KG", "Tomate pelado")).toBe(0);
    const ranked = rankCandidates("AZEITE VIRG.EXTRA OLIVEIRA 5L", CATALOG);
    expect(ranked[0]!.item.id).toBe("azeite");
  });

  test("só sugere sem IA quando o nome é claramente um artigo (e não empata com outro)", () => {
    expect(confidentNameMatch(rankCandidates("Farinha T65 Cerealis 25kg", CATALOG))?.item.id).toBe("farinha");
    expect(confidentNameMatch(rankCandidates("Refrigerante cola 33cl", CATALOG))).toBeNull();
    expect(confidentNameMatch([{ item: CATALOG[0]!, score: 0.8 }, { item: CATALOG[1]!, score: 0.7 }])).toBeNull();
  });

  test.each([
    ["Farinha T65 25kg", { count: 1, size: { quantity: 25, unit: "kg" } }],
    ["Água 1,5L x6", { count: 6, size: { quantity: 1.5, unit: "l" } }],
    ["Coca-Cola 24x33cl", { count: 24, size: { quantity: 33, unit: "cl" } }],
    ["Ovos cx 30", { count: 30, size: null }],
  ])("embalagem: %s", (d, expected) => {
    expect(parsePackSize(d)).toEqual(expected);
  });

  test.each([
    ["Farinha T65 25kg", "saco", "kg", 25],
    ["Farinha T65 25kg", "saco", "g", 25000],
    ["Água 1,5L x6", "pack", "l", 9],
    ["Água 1,5L x6", "pack", "un", 6],
    ["Coca-Cola 24x33cl", "cx", "ml", 7920],
    ["Mozzarella", "kg", "g", 1000],
    ["Mozzarella", "kg", "kg", 1],
    ["Azeite 5L", "garrafa", "kg", null],
    ["Tomate pelado", "lata", "kg", null],
  ])("fator: %s (%s → %s) = %s", (d, purchase, base, factor) => {
    expect(suggestConversionFactor(d, purchase, base)).toBe(factor);
  });
});

class FakeAi implements StockItemMatchAiPort {
  calls: StockItemMatchAiLine[][] = [];
  constructor(private readonly answer: (l: StockItemMatchAiLine) => Omit<StockItemMatchAiResult, "index">) {}
  async match(lines: StockItemMatchAiLine[]) {
    this.calls.push(lines);
    return lines.map((l) => ({ index: l.index, ...this.answer(l) }));
  }
}

function seed(repository: FakeStockPurchaseReviewRepository, descriptions: [string, string, string?][]) {
  const review = StockPurchaseReview.create({
    organizationId: ORG, invoiceId: "inv-1", sourceInvoiceVersion: 1, sourceHash: "h", decisionSource: "category", decisionSupplierId: "sup-1",
    decisionPolicyUsed: "CREATE_REVIEW", supplierName: "Makro", invoiceNumber: "FT 1", invoiceDate: "2026-10-20", invoiceTotalCents: 74850,
  }).startReview();
  const lines = descriptions.map(([description, unit, code], i) =>
    StockReviewLine.create({ organizationId: ORG, reviewId: review.id, invoiceLineId: `il-${i}`, description, purchaseQuantity: 1, purchaseUnit: unit, unitCostWithoutVat: 100, totalWithVat: 123, vatAmount: 23, supplierItemCode: code ?? null }),
  );
  repository.seedReview(review);
  repository.seedLines(lines);
  return { review, lines };
}

function setup(ai: StockItemMatchAiPort | null) {
  const repository = new FakeStockPurchaseReviewRepository();
  const catalog = new FakeStockCatalogWrite();
  CATALOG.forEach((i) => catalog.seed(i));
  const learned = new FakeStockReviewLearnedMapping();
  const uc = new SuggestReviewMappingsUseCase(repository, learned, catalog, ai);
  return { repository, learned, uc };
}

describe("F3b — conciliação em lote", () => {
  test("histórico (pela referência) → nome → IA só para o resto, numa chamada; só o confirmado (histórico) se resolve sozinho", async () => {
    const ai = new FakeAi((l) =>
      l.description.startsWith("Refrigerante") ? { resolution: "existing_item", stockItemId: "coca", conversionFactor: 24, confidence: 0.9 }
        : l.description.startsWith("Entrega") ? { resolution: "no_stock_effect", stockItemId: null, conversionFactor: null, confidence: 0.95 }
          : { resolution: null, stockItemId: null, conversionFactor: null, confidence: 0.2 },
    );
    const s = setup(ai);
    s.learned.learned.push({ supplierId: "sup-1", supplierReference: "778899", normalizedDescription: "outra descrição", resolutionType: "existing_item", stockItemId: "mozz", conversionFactor: 1, purchaseUnit: "kg" });
    s.learned.activeItemIds.add("mozz");
    const { review } = seed(s.repository, [
      ["MOZZ. FDL 1KG", "kg", "778899"],
      ["Farinha T65 Cerealis 25kg", "saco"],
      ["Refrigerante cola 24x33cl", "cx"],
      ["Entrega ao domicílio", "un"],
      ["Coisa estranha", "un"],
    ]);

    const dto = await s.uc.execute({ organizationId: ORG, reviewId: review.id });
    const byDesc = Object.fromEntries(dto.lines.map((l) => [l.description, l.suggestion]));
    expect(byDesc["MOZZ. FDL 1KG"]).toMatchObject({ source: "learned", stockItemId: "mozz", conversionFactor: 1, packagingChanged: false });
    expect(byDesc["Farinha T65 Cerealis 25kg"]).toMatchObject({ source: "name_match", stockItemId: "farinha", conversionFactor: 25 });
    expect(byDesc["Refrigerante cola 24x33cl"]).toMatchObject({ source: "ai", resolution: "existing_item", stockItemId: "coca", conversionFactor: 24 });
    expect(byDesc["Entrega ao domicílio"]).toMatchObject({ source: "ai", resolution: "no_stock_effect" });
    expect(byDesc["Coisa estranha"]).toMatchObject({ source: "none" });
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]!.map((l) => l.description)).toEqual(["Refrigerante cola 24x33cl", "Entrega ao domicílio", "Coisa estranha"]);
    // «Ensinar uma vez»: a associação confirmada resolve-se sem perguntas; nome e IA ficam por confirmar.
    expect(dto.lines.filter((l) => l.resolutionType !== "unresolved").map((l) => [l.description, l.resolutionType, l.autoResolved, l.conversionFactor])).toEqual([["MOZZ. FDL 1KG", "existing_item", true, 1]]);

    // Reabrir não volta a chamar a IA; «refresh» volta.
    await s.uc.execute({ organizationId: ORG, reviewId: review.id });
    expect(ai.calls).toHaveLength(1);
    await s.uc.execute({ organizationId: ORG, reviewId: review.id, refresh: true });
    expect(ai.calls).toHaveLength(2);
  });

  test("IA não pode escolher um artigo fora dos candidatos; falha da IA não impede a revisão", async () => {
    const s = setup(new FakeAi(() => ({ resolution: "existing_item", stockItemId: "inventado", conversionFactor: null, confidence: 0.99 })));
    const { review } = seed(s.repository, [["Coisa estranha", "un"]]);
    expect((await s.uc.execute({ organizationId: ORG, reviewId: review.id })).lines[0]!.suggestion).toMatchObject({ source: "none" });

    const broken = setup({ match: async () => { throw new Error("timeout"); } });
    const b = seed(broken.repository, [["Coisa estranha", "un"]]);
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect((await broken.uc.execute({ organizationId: ORG, reviewId: b.review.id })).lines[0]!.suggestion?.source).toBe("none");
    spy.mockRestore();
  });

  test("embalagem mudou desde o aprendido → assinala e propõe o fator pela nova embalagem", async () => {
    const s = setup(null);
    s.learned.learned.push({ supplierId: "sup-1", supplierReference: null, normalizedDescription: "farinha t65 cerealis 25kg", resolutionType: "existing_item", stockItemId: "farinha", conversionFactor: 1, purchaseUnit: "kg" });
    s.learned.activeItemIds.add("farinha");
    const { review } = seed(s.repository, [["Farinha T65 Cerealis 25kg", "saco"]]);
    expect((await s.uc.execute({ organizationId: ORG, reviewId: review.id })).lines[0]!.suggestion).toMatchObject({ source: "learned", packagingChanged: true, conversionFactor: 25 });
  });
});

describe("F3b — fila: vista ativa/histórico e repor", () => {
  test("lista separa por tratar do histórico, com progresso e valor", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const { review, lines } = seed(repository, [["Farinha", "kg"], ["Água", "un"]]);
    repository.seedLines([lines[0]!.resolveAsNoStockEffect("g")]);
    const list = new ListStockPurchaseReviewsUseCase(repository);
    expect(await list.execute({ organizationId: ORG, view: "active" })).toEqual([expect.objectContaining({ id: review.id, linesCount: 2, resolvedLines: 1, totalCents: 74850 })]);
    expect(await list.execute({ organizationId: ORG, view: "history" })).toEqual([]);
    repository.seedReview(review.cancel("Não é desta loja"));
    expect(await list.execute({ organizationId: ORG, view: "history" })).toHaveLength(1);
  });

  test("repor uma revisão retirada recalcula o estado; só retiradas podem ser repostas", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const { review, lines } = seed(repository, [["Farinha", "kg"]]);
    const audit = new FakeStockReviewAuditLog();
    const uc = new RestoreStockPurchaseReviewUseCase(repository, audit);
    await expect(uc.execute({ organizationId: ORG, id: review.id, actor: "g", expectedVersion: review.version })).rejects.toBeInstanceOf(ReviewNotCancelledError);
    repository.seedLines([lines[0]!.resolveAsNoStockEffect("g")]);
    const cancelled = review.cancel("engano");
    repository.seedReview(cancelled);
    const dto = await uc.execute({ organizationId: ORG, id: review.id, actor: "g", expectedVersion: cancelled.version });
    expect(dto).toMatchObject({ status: "ready", cancellationReason: null });
  });
});
