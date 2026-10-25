import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import { computeReviewConference } from "../../domain/services/review-conference.service.js";
import { ConfirmStockPurchaseReviewUseCase } from "../../application/use-cases/confirm-stock-purchase-review.use-case.js";
import { GetStockPurchaseReviewUseCase } from "../../application/use-cases/get-stock-purchase-review.use-case.js";
import { ResolveReviewLineUseCase } from "../../application/use-cases/resolve-review-line.use-case.js";
import { RecordInvoiceFinalizedForStockUseCase } from "../../application/use-cases/record-invoice-finalized-for-stock.use-case.js";
import { computeInvoiceSourceHash } from "../../application/use-cases/shared.js";
import { DocumentNotReconciledError, InvalidReviewLineResolutionError } from "../../domain/errors.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";
import { FakeStockMovementWrite } from "../fakes/fake-stock-movement-write.js";
import { FakeInvoiceRead, invoiceSnapshotStub } from "../fakes/fake-invoice-read.js";
import { FakeLocationRead } from "../fakes/fake-location-read.js";
import { FakeStockReviewAuditLog } from "../fakes/fake-stock-review-audit-log.js";
import { FakeCostCenterCategoryRead } from "../fakes/fake-cost-center-category-read.js";
import { FakeStockCatalogWrite } from "../fakes/fake-stock-catalog-write.js";
import { FakeStockReviewLearnedMapping } from "../fakes/fake-stock-review-learned-mapping.js";
import { FakeSupplierRead } from "../fakes/fake-supplier-read.js";

const ORG = mintOrganizationId("org-test");

// Exemplo da task v1.2 (F3): fatura Makro de 650 € de base — bebidas 100 €, equipamento 250 €, ingredientes 300 €.
const MAKRO = [
  { id: "l-beb", description: "Água 1,5L x6", qty: 10, unit: "pack", price: 1000, net: 10000, vat: 2300, category: "cat-bebidas" },
  { id: "l-eq", description: "Batedeira industrial", qty: 1, unit: "un", price: 25000, net: 25000, vat: 5750, category: "cat-equip" },
  { id: "l-ing", description: "Farinha T65 25kg", qty: 12, unit: "saco", price: 2500, net: 30000, vat: 1800, category: "cat-ingred" },
];
const MAKRO_NET = 65000;
const MAKRO_VAT = 9850;

function seed(repository: FakeStockPurchaseReviewRepository, opts: { invoiceNetCents?: number; sourceHash?: string } = {}) {
  const review = StockPurchaseReview.create({
    organizationId: ORG,
    invoiceId: "inv-1",
    sourceInvoiceVersion: 1,
    sourceHash: opts.sourceHash ?? "hash-1",
    decisionSource: "category",
    decisionSupplierId: "sup-1",
    decisionPolicyUsed: "CREATE_REVIEW",
    supplierName: "Makro",
    invoiceNumber: "FT 1",
    invoiceDate: "2026-10-20",
    invoiceNetCents: opts.invoiceNetCents ?? MAKRO_NET,
    invoiceVatCents: MAKRO_VAT,
    invoiceTotalCents: MAKRO_NET + MAKRO_VAT,
  }).startReview();
  const lines = MAKRO.map((m) =>
    StockReviewLine.create({
      organizationId: ORG,
      reviewId: review.id,
      invoiceLineId: m.id,
      description: m.description,
      purchaseQuantity: m.qty,
      purchaseUnit: m.unit,
      unitCostWithoutVat: m.price,
      totalWithVat: m.net + m.vat,
      vatAmount: m.vat,
      costCenterCategoryId: m.category,
    }),
  );
  repository.seedReview(review);
  repository.seedLines(lines);
  return { review, lines };
}

function categories() {
  const c = new FakeCostCenterCategoryRead();
  c.policies.set("cat-bebidas", "CREATE_REVIEW");
  c.policies.set("cat-ingred", "CREATE_REVIEW");
  c.policies.set("cat-equip", "NO_STOCK_EFFECT");
  return c;
}

function resolveAll(lines: StockReviewLine[], how: Record<string, "item" | "none">) {
  return lines.map((l) => {
    const invoiceLineId = l.toProps().invoiceLineId;
    return how[invoiceLineId] === "none"
      ? l.resolveAsNoStockEffect("gestor@teste.pt")
      : l.resolveToStockItem({ stockItemId: `item-${invoiceLineId}`, conversionFactor: 1, locationId: "loc-1", isItemActive: true }, false, "gestor@teste.pt");
  });
}

describe("F3a — conferências (domínio)", () => {
  const input = (lines: StockReviewLine[], invoiceNetCents = MAKRO_NET) => ({
    invoiceNetCents,
    invoiceVatCents: MAKRO_VAT,
    invoiceTotalCents: MAKRO_NET + MAKRO_VAT,
    lines: lines.map((l) => {
      const p = l.toProps();
      return { id: p.id, description: p.description, totalWithVat: p.totalWithVat, vatAmount: p.vatAmount, resolutionType: p.resolutionType, costCenterCategoryId: p.costCenterCategoryId };
    }),
    categoryPolicies: new Map([["cat-bebidas", "CREATE_REVIEW"], ["cat-ingred", "CREATE_REVIEW"], ["cat-equip", "NO_STOCK_EFFECT"]] as const),
  });

  test("Makro 650 €: documento reconcilia com todas as linhas; Stock só 400 € (equipamento fica financeiro); sem divergências", () => {
    const { lines } = seed(new FakeStockPurchaseReviewRepository());
    const c = computeReviewConference(input(resolveAll(lines, { "l-eq": "none" })));
    expect(c.document).toMatchObject({ status: "ok", linesNetCents: 65000, linesVatCents: 9850, netDifferenceCents: 0, vatDifferenceCents: 0 });
    expect(c.stock).toEqual({ inventoriableLines: 2, nonStockLines: 1, unresolvedLines: 0, inventoriableNetCents: 40000, nonStockNetCents: 25000 });
    expect(c.categories.divergences).toEqual([]);
  });

  test("base da fatura diferente das linhas → documento em divergência", () => {
    const { lines } = seed(new FakeStockPurchaseReviewRepository());
    expect(computeReviewConference(input(lines, 65100)).document).toMatchObject({ status: "mismatch", netDifferenceCents: -100 });
  });

  test("sem IVA por linha (revisão anterior à F3a) → conferência indisponível, nunca bloqueia", () => {
    const old = StockReviewLine.create({ organizationId: ORG, reviewId: "r", invoiceLineId: "x", description: "x", purchaseQuantity: 1, purchaseUnit: "un", unitCostWithoutVat: 100, totalWithVat: 123 });
    const c = computeReviewConference({ ...input([old]) });
    expect(c.document.status).toBe("unavailable");
    expect(c.stock.inventoriableNetCents).toBeNull();
  });

  test("categoria versus tratamento: ingrediente sem stock e equipamento como artigo → pendências (não bloqueiam)", () => {
    const { lines } = seed(new FakeStockPurchaseReviewRepository());
    const c = computeReviewConference(input(resolveAll(lines, { "l-ing": "none" })));
    expect(c.document.status).toBe("ok");
    expect(c.categories.divergences.map((d) => [d.description, d.kind])).toEqual([
      ["Batedeira industrial", "stock_line_in_non_stock_category"],
      ["Farinha T65 25kg", "non_stock_line_in_stock_category"],
    ]);
  });
});

describe("F3a — linha: custo a partir do líquido e divisão por lojas", () => {
  // Mozzarella da F1: 20 × 6,20 = 124,00; desconto 10% → base 111,60; IVA 6% = 6,70; total 118,30.
  const mozzarella = () =>
    StockReviewLine.create({ organizationId: ORG, reviewId: "r", invoiceLineId: "moz", description: "Mozzarella", purchaseQuantity: 20, purchaseUnit: "kg", unitCostWithoutVat: 620, totalWithVat: 11830, vatAmount: 670 });

  test("custo unitário usa o líquido com desconto (não o preço de tabela)", () => {
    const line = mozzarella();
    expect(line.netAmount).toBe(11160);
    expect(line.discountAmount).toBe(1240);
    const p = line.resolveToStockItem({ stockItemId: "item-moz", conversionFactor: 1000, isItemActive: true }, false, "g").toProps();
    expect(p.stockQuantity).toBe(20000);
    expect(p.unitCostPerBaseUnitWithoutVat).toBeCloseTo(0.558, 6);
    expect(p.unitCostPerBaseUnitWithVat).toBeCloseTo(0.5915, 6);
  });

  test("divisão por lojas: quantidades explícitas que somam a linha; sem loja única", () => {
    const p = mozzarella()
      .resolveToStockItem({ stockItemId: "item-moz", conversionFactor: 1000, locationId: "loc-1", locationSplits: [{ locationId: "loc-1", purchaseQuantity: 12 }, { locationId: "loc-2", purchaseQuantity: 8 }], isItemActive: true }, false, "g")
      .toProps();
    expect(p.locationSplits).toEqual([{ locationId: "loc-1", purchaseQuantity: 12 }, { locationId: "loc-2", purchaseQuantity: 8 }]);
    expect(p.locationId).toBeNull();
  });

  test.each([
    [[{ locationId: "loc-1", purchaseQuantity: 20 }, { locationId: "loc-2", purchaseQuantity: 20 }], /soma das quantidades por loja \(40\)/],
    [[{ locationId: "loc-1", purchaseQuantity: 10 }, { locationId: "loc-1", purchaseQuantity: 10 }], /mesma loja/],
    [[{ locationId: "loc-1", purchaseQuantity: 20 }], /pelo menos duas lojas/],
  ])("divisão inválida é recusada (%#)", (splits, message) => {
    expect(() => mozzarella().resolveToStockItem({ stockItemId: "i", conversionFactor: 1, locationSplits: splits, isItemActive: true }, false, "g")).toThrow(message);
  });
});

describe("F3a — casos de uso", () => {
  function confirmSetup(opts: { invoiceNetCents?: number } = {}) {
    const repository = new FakeStockPurchaseReviewRepository();
    const invoice = invoiceSnapshotStub({ id: "inv-1" });
    const hash = computeInvoiceSourceHash(invoice.invoiceNumber, invoice.invoiceDate, invoice.lines);
    const seeded = seed(repository, { ...opts, sourceHash: hash });
    const invoiceRead = new FakeInvoiceRead();
    invoiceRead.invoices.set("inv-1", invoice);
    const locationRead = new FakeLocationRead();
    locationRead.locations = [{ id: "loc-1", name: "Loja A", isActive: true }];
    const movements = new FakeStockMovementWrite(repository);
    const uc = new ConfirmStockPurchaseReviewUseCase(repository, movements, invoiceRead, locationRead, new FakeStockReviewAuditLog(), categories());
    const ready = (how: Record<string, "item" | "none">) => {
      repository.seedLines(resolveAll(seeded.lines, how));
      const review = seeded.review.refreshLinesProgress(true, true);
      repository.seedReview(review);
      return review;
    };
    return { repository, movements, uc, ready };
  }

  test("confirmar a Makro: movimenta, guarda a pendência de categoria sem bloquear", async () => {
    const s = confirmSetup();
    const review = s.ready({ "l-eq": "item" });
    const dto = await s.uc.execute({ organizationId: ORG, id: review.id, expectedVersion: review.version, actor: "gestor@teste.pt" });
    expect(dto.status).toBe("applied");
    expect(dto.categoryDivergences).toEqual([expect.objectContaining({ description: "Batedeira industrial", kind: "stock_line_in_non_stock_category" })]);
    expect(dto.conference?.stock.inventoriableNetCents).toBe(65000);
  });

  test("todas as linhas «Não é item de stock» → «Excluída — não afeta Stock», sem movimento", async () => {
    const s = confirmSetup();
    const review = s.ready({ "l-beb": "none", "l-eq": "none", "l-ing": "none" });
    const dto = await s.uc.execute({ organizationId: ORG, id: review.id, expectedVersion: review.version, actor: "gestor@teste.pt" });
    expect(dto.status).toBe("excluded");
  });

  test("linhas que não batem com a base da fatura impedem movimentar (sem chamar a RPC)", async () => {
    const s = confirmSetup({ invoiceNetCents: 64900 });
    const review = s.ready({ "l-eq": "none" });
    await expect(s.uc.execute({ organizationId: ORG, id: review.id, expectedVersion: review.version, actor: "g" })).rejects.toBeInstanceOf(DocumentNotReconciledError);
    expect(s.movements.confirmCalls).toHaveLength(0);
  });

  test("GET traz as três conferências", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const { review } = seed(repository);
    const dto = await new GetStockPurchaseReviewUseCase(repository, categories()).execute({ organizationId: ORG, id: review.id });
    expect(dto.conference).toMatchObject({ document: { status: "ok" }, stock: { unresolvedLines: 3 }, categories: { divergences: [] } });
    expect(dto.lines[0]).toMatchObject({ vatAmount: 2300, netAmount: 10000, discountAmount: 0, costCenterCategoryId: "cat-bebidas" });
  });

  test("resolver com divisão por lojas valida lojas ativas", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const { review, lines } = seed(repository);
    const catalog = new FakeStockCatalogWrite();
    catalog.seed({ id: "item-farinha", name: "Farinha T65", baseUnit: "kg", isActive: true });
    const locations = new FakeLocationRead();
    locations.locations = [{ id: "loc-1", name: "A", isActive: true }, { id: "loc-2", name: "B", isActive: true }, { id: "loc-3", name: "C", isActive: false }];
    const uc = new ResolveReviewLineUseCase(repository, catalog, new FakeStockReviewLearnedMapping(), new FakeStockReviewAuditLog(), locations, categories());
    const farinha = lines[2]!;
    const base = { organizationId: ORG, reviewId: review.id, lineId: farinha.id, expectedVersion: review.version, resolution: "existing_item" as const, stockItemId: "item-farinha", conversionFactor: 25, actor: "g" };
    await expect(uc.execute({ ...base, locationSplits: [{ locationId: "loc-1", purchaseQuantity: 6 }, { locationId: "loc-3", purchaseQuantity: 6 }] })).rejects.toBeInstanceOf(InvalidReviewLineResolutionError);
    const dto = await uc.execute({ ...base, locationSplits: [{ locationId: "loc-1", purchaseQuantity: 7 }, { locationId: "loc-2", purchaseQuantity: 5 }] });
    expect(dto.lines.find((l) => l.id === farinha.id)).toMatchObject({ stockQuantity: 300, locationSplits: [{ locationId: "loc-1", purchaseQuantity: 7 }, { locationId: "loc-2", purchaseQuantity: 5 }] });
  });

  test("a fatura passa ao Stock o IVA da linha, a categoria, a loja e os totais", async () => {
    const movements = new FakeStockMovementWrite();
    const uc = new RecordInvoiceFinalizedForStockUseCase(movements, categories(), new FakeSupplierRead());
    await uc.execute({
      organizationId: ORG, invoiceId: "inv-9", invoiceNumber: "FT 9", invoiceDate: "2026-10-20", supplierId: null, supplierName: "Makro", supplierNif: null,
      override: "auto", overrideReason: null, subtotalWithoutVat: 30000, totalVat: 1800, totalWithVat: 31800,
      lines: [{ id: "l-ing", description: "Farinha T65 25kg", quantity: 12, unit: "saco", unitCostWithoutVat: 2500, totalWithVat: 31800, vatAmount: 1800, supplierItemCode: "12345", costCenterCategoryId: "cat-ingred", locationId: "loc-1" }],
      actor: null,
    });
    expect(movements.calls[0]).toMatchObject({
      invoiceNetCents: 30000, invoiceVatCents: 1800, invoiceTotalCents: 31800,
      lines: [{ vatAmount: 1800, supplierItemCode: "12345", costCenterCategoryId: "cat-ingred", locationId: "loc-1" }],
    });
  });
});
