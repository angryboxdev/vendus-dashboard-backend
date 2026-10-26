import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import { suggestConversionFactor } from "../../domain/services/item-matching.service.js";
import { RecordInvoiceFinalizedForStockUseCase } from "../../application/use-cases/record-invoice-finalized-for-stock.use-case.js";
import { FakeStockMovementWrite } from "../fakes/fake-stock-movement-write.js";
import { FakeCostCenterCategoryRead } from "../fakes/fake-cost-center-category-read.js";
import { FakeSupplierRead } from "../fakes/fake-supplier-read.js";

const ORG = mintOrganizationId("org-test");

// Task V5 §4.2 — FT 63388 do lado do Stock: linhas como chegam do Financeiro (unidade «un», a
// unidade real no texto), valores líquidos depois do desconto da linha, artigos em g.
const ft63388 = [
  { id: "mozz", description: "Q. Mozzarella ralado 100% Eurial kg", quantity: 40, unitCost: 620, net: 22320, vat: 1339, factor: 1000, perGram: 0.558 },
  { id: "grana", description: "Q. Grana Padano Ralado Maser 1 kg", quantity: 1, unitCost: 1559, net: 1481, vat: 89, factor: 1000, perGram: 1.481 },
  { id: "cheddar-a", description: "Q. Cheddar Ralado kg", quantity: 6, unitCost: 820, net: 4674, vat: 280, factor: 1000, perGram: 0.779 },
  { id: "cheddar-b", description: "Q. Cheddar Ralado kg", quantity: 1, unitCost: 820, net: 779, vat: 47, factor: 1000, perGram: 0.779 },
  { id: "tomate", description: "Tomate Mutti p/ Pizza Classico 5 kg bolsa", quantity: 4, unitCost: 1068, net: 3845, vat: 884, factor: 5000, perGram: 0.19225 },
];

describe("V5 — FT 63388 no Stock: conversões e custo por grama depois do desconto", () => {
  test("T03/T11: «…kg» converte 1 kg = 1000 g sem perguntar; «1 kg» = 1000 g; bolsa de 5 kg = 5000 g (Qt/Cx ignorado)", () => {
    expect(ft63388.map((l) => suggestConversionFactor(l.description, "un", "g"))).toEqual([1000, 1000, 1000, 1000, 5000]);
    // Nunca massa → volume nem a contagem sem embalagem conhecida.
    expect(suggestConversionFactor("Q. Cheddar Ralado kg", "un", "ml")).toBeNull();
    expect(suggestConversionFactor("Água das Pedras", "un", "g")).toBeNull();
  });

  test("custo por unidade-base sai do líquido da linha (desconto incluído), em cêntimos por g", () => {
    const resolved = ft63388.map((l) =>
      StockReviewLine.create({
        organizationId: ORG, reviewId: "r1", invoiceLineId: l.id, description: l.description, purchaseQuantity: l.quantity, purchaseUnit: "un",
        unitCostWithoutVat: l.unitCost, totalWithVat: l.net + l.vat, vatAmount: l.vat, supplierItemCode: null,
      }).resolveToStockItem({ stockItemId: l.id, conversionFactor: l.factor, isItemActive: true }, false, "gestor@teste.pt").toProps(),
    );
    expect(resolved.map((p) => [p.stockQuantity, p.unitCostPerBaseUnitWithoutVat])).toEqual(ft63388.map((l) => [l.quantity * l.factor, l.perGram]));
    // T02: o Cheddar continua em duas linhas (dois lotes) — 6000 g + 1000 g, o mesmo custo por grama.
    expect(resolved.filter((p) => p.description === "Q. Cheddar Ralado kg").map((p) => p.stockQuantity)).toEqual([6000, 1000]);
  });
});

describe("V5 §4.3 — nota de crédito não é uma compra", () => {
  test("valores negativos: sem revisão, sem movimento, sem observação de preço", async () => {
    const write = new FakeStockMovementWrite();
    const categories = new FakeCostCenterCategoryRead();
    categories.policies.set("cat-ing", "CREATE_REVIEW");
    const uc = new RecordInvoiceFinalizedForStockUseCase(write, categories, new FakeSupplierRead());
    const base = {
      organizationId: ORG, invoiceId: "nc-1", invoiceNumber: "NC 1", invoiceDate: "2026-10-06", supplierId: "sup-1", supplierName: "Dream Plus",
      supplierNif: null, override: "auto" as const, overrideReason: null, actor: null,
    };
    await uc.execute({ ...base, totalWithVat: -826, lines: [{ id: "l1", description: "Q. Cheddar Ralado kg", quantity: -1, unit: "un", unitCostWithoutVat: -820, totalWithVat: -826, costCenterCategoryId: "cat-ing", locationId: null }] });
    expect(write.calls).toHaveLength(0);
    // A fatura normal continua a criar a revisão.
    await uc.execute({ ...base, invoiceId: "ft-1", totalWithVat: 826, lines: [{ id: "l2", description: "Q. Cheddar Ralado kg", quantity: 1, unit: "un", unitCostWithoutVat: 820, totalWithVat: 826, costCenterCategoryId: "cat-ing", locationId: null }] });
    expect(write.calls).toHaveLength(1);
  });
});

describe("depósito de embalagem (latas/garrafas) — nunca é Stock", () => {
  test("reconhece «DEPOSITO 28 X 0.10 EUR» e variantes, sem apanhar artigos normais", async () => {
    const { isDepositLine } = await import("../../domain/services/deposit-line.service.js");
    expect(["DEPOSITO 28 X 0.10 EUR", "Depósito 24x0,10€", "DEP. GARRAFA", "Deposito de embalagens"].map(isDepositLine)).toEqual([true, true, true, true]);
    expect(["Água das Pedras 25cl", "Queijo depositado", "Cerveja Super Bock 33cl"].map(isDepositLine)).toEqual([false, false, false]);
  });

  test("na conciliação fica «Fora do Stock» sozinha, marcada como automática e corrigível", async () => {
    const { SuggestReviewMappingsUseCase, DEPOSIT_RESOLVED_BY } = await import("../../application/use-cases/suggest-review-mappings.use-case.js");
    const { StockPurchaseReview } = await import("../../domain/entities/stock-purchase-review.js");
    const { FakeStockPurchaseReviewRepository } = await import("../fakes/fake-stock-purchase-review-repository.js");
    const { FakeStockCatalogWrite } = await import("../fakes/fake-stock-catalog-write.js");
    const { FakeStockReviewLearnedMapping } = await import("../fakes/fake-stock-review-learned-mapping.js");
    const repository = new FakeStockPurchaseReviewRepository();
    const review = StockPurchaseReview.create({
      organizationId: ORG, invoiceId: "inv-1", sourceInvoiceVersion: 1, sourceHash: "h", decisionSource: "category", decisionSupplierId: "sup-1",
      decisionPolicyUsed: "CREATE_REVIEW", supplierName: "Bebidas Exemplo", invoiceNumber: "FT 1", invoiceDate: "2026-10-20",
    }).startReview();
    repository.seedReview(review);
    repository.seedLines([
      StockReviewLine.create({ organizationId: ORG, reviewId: review.id, invoiceLineId: "a", description: "DEPOSITO 28 X 0.10 EUR", purchaseQuantity: 28, purchaseUnit: "un", unitCostWithoutVat: 10, totalWithVat: 280, vatAmount: 0, supplierItemCode: null }),
    ]);
    const uc = new SuggestReviewMappingsUseCase(repository, new FakeStockReviewLearnedMapping(), new FakeStockCatalogWrite(), null);
    const dto = await uc.execute({ organizationId: ORG, reviewId: review.id });
    expect(dto.lines[0]).toMatchObject({ resolutionType: "no_stock_effect", resolvedBy: DEPOSIT_RESOLVED_BY, autoResolved: true });
  });
});
