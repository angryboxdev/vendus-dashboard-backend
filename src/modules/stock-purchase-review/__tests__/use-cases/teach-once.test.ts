import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import { SuggestReviewMappingsUseCase, AUTO_RESOLVED_BY, isEan, packageSizeConflict } from "../../application/use-cases/suggest-review-mappings.use-case.js";
import { ResolveReviewLineUseCase } from "../../application/use-cases/resolve-review-line.use-case.js";
import { SavePurchasePresentationUseCase } from "../../application/use-cases/purchase-presentations.use-case.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";
import { FakeStockCatalogWrite } from "../fakes/fake-stock-catalog-write.js";
import { FakeStockReviewLearnedMapping } from "../fakes/fake-stock-review-learned-mapping.js";
import { FakeStockReviewAuditLog } from "../fakes/fake-stock-review-audit-log.js";
import { FakePurchasePresentationRepository } from "../fakes/fake-purchase-presentation-repository.js";

const ORG = mintOrganizationId("org-test");
const SUP = "sup-dream";

/** Ambiente partilhado por várias faturas do mesmo fornecedor (o que se aprende numa vale para as seguintes). */
function world() {
  const repository = new FakeStockPurchaseReviewRepository();
  const catalog = new FakeStockCatalogWrite();
  catalog.seed({ id: "mozz", name: "Mozzarella ralada", baseUnit: "g", isActive: true });
  catalog.seed({ id: "mozz-b", name: "Mozzarella fior di latte", baseUnit: "g", isActive: true });
  catalog.seed({ id: "tomate", name: "Tomate pelado", baseUnit: "kg", isActive: true });
  catalog.seed({ id: "natas", name: "Natas", baseUnit: "l", isActive: true });
  const learned = new FakeStockReviewLearnedMapping();
  ["mozz", "mozz-b", "tomate", "natas"].forEach((id) => learned.activeItemIds.add(id));
  const audit = new FakeStockReviewAuditLog();
  const presentations = new FakePurchasePresentationRepository();
  const packaging = { presentations, catalog };
  const suggest = new SuggestReviewMappingsUseCase(repository, learned, catalog, null, undefined, undefined, packaging, audit);
  const resolve = new ResolveReviewLineUseCase(repository, catalog, learned, audit, undefined, undefined, packaging);
  const savePresentation = new SavePurchasePresentationUseCase(presentations, catalog, learned, audit);
  let n = 0;
  /** Uma fatura nova com as linhas dadas (preço/quantidade/desconto à escolha). */
  const invoice = (lines: { code: string | null; description: string; qty: number; unit: string; price: number; net: number; vat: number }[], supplierId = SUP) => {
    n++;
    const review = StockPurchaseReview.create({
      organizationId: ORG, invoiceId: `inv-${n}`, sourceInvoiceVersion: 1, sourceHash: "h", decisionSource: "category", decisionSupplierId: supplierId,
      decisionPolicyUsed: "CREATE_REVIEW", supplierName: "Fornecedor", invoiceNumber: `FT ${n}`, invoiceDate: "2026-10-20",
    }).startReview();
    const ls = lines.map((l, i) =>
      StockReviewLine.create({ organizationId: ORG, reviewId: review.id, invoiceLineId: `inv-${n}-l${i}`, description: l.description, purchaseQuantity: l.qty, purchaseUnit: l.unit, unitCostWithoutVat: l.price, totalWithVat: l.net + l.vat, vatAmount: l.vat, supplierItemCode: l.code }),
    );
    repository.seedReview(review);
    repository.seedLines(ls);
    return { review, lines: ls };
  };
  const open = (reviewId: string) => suggest.execute({ organizationId: ORG, reviewId });
  return { repository, catalog, learned, audit, presentations, suggest, resolve, savePresentation, invoice, open };
}

describe("ensinar uma vez (task Stock inteligente V4 §3)", () => {
  test("1.ª fatura: a pessoa confirma; as 10 seguintes (preços, quantidades e descontos diferentes) resolvem-se sozinhas, custo recalculado, sem duplicar nada", async () => {
    const w = world();
    const first = w.invoice([{ code: "44641004", description: "Q. Mozzarella ralado 100% Eurial kg", qty: 20, unit: "kg", price: 620, net: 11160, vat: 670 }]);
    await w.open(first.review.id);
    await w.resolve.execute({ organizationId: ORG, reviewId: first.review.id, lineId: first.lines[0]!.id, expectedVersion: (await w.repository.findById(ORG, first.review.id))!.version, resolution: "existing_item", stockItemId: "mozz", conversionFactor: 1000, actor: "stock@teste.pt" });
    const learnedAfterFirst = w.learned.learned.length;

    let questions = 0;
    for (let k = 1; k <= 10; k++) {
      const qty = 10 + k, price = 600 + k * 5, net = Math.round(qty * price * 0.9);
      const inv = w.invoice([{ code: "44641004", description: "Q. Mozzarella ralado 100% Eurial kg", qty, unit: "kg", price, net, vat: Math.round(net * 0.06) }]);
      const dto = await w.open(inv.review.id);
      const line = dto.lines[0]!;
      if (line.resolutionType === "unresolved") questions++;
      expect(line).toMatchObject({ resolutionType: "existing_item", stockItemId: "mozz", conversionFactor: 1000, autoResolved: true, resolvedBy: AUTO_RESOLVED_BY, stockQuantity: qty * 1000 });
      // Custo desta fatura (nunca o antigo): líquido ÷ gramas.
      expect(line.unitCostPerBaseUnitWithoutVat).toBeCloseTo(net / (qty * 1000), 9);
      expect(dto.status).toBe("ready");
    }
    expect(questions).toBe(0);
    expect(w.learned.learned.length).toBe(learnedAfterFirst);
  });

  test("correção humana prevalece nas faturas seguintes (e a embalagem confirmada acompanha o artigo novo)", async () => {
    const w = world();
    await w.savePresentation.execute({ organizationId: ORG, supplierId: SUP, supplierReference: "44641004", description: "Q. Mozzarella ralado 100% Eurial kg", stockItemId: "mozz", packageUnit: "saco", contentQuantity: 2.5, contentUnit: "kg", invoicedBy: "content", actor: "stock@teste.pt" });
    const a = w.invoice([{ code: "44641004", description: "Q. Mozzarella ralado 100% Eurial kg", qty: 20, unit: "kg", price: 620, net: 11160, vat: 670 }]);
    const auto = await w.open(a.review.id);
    expect(auto.lines[0]).toMatchObject({ stockItemId: "mozz", autoResolved: true });
    // A pessoa corrige para outro artigo.
    await w.resolve.execute({ organizationId: ORG, reviewId: a.review.id, lineId: a.lines[0]!.id, expectedVersion: auto.version, resolution: "existing_item", stockItemId: "mozz-b", conversionFactor: 1000, actor: "chefe@teste.pt" });
    const b = w.invoice([{ code: "44641004", description: "Q. Mozzarella ralado 100% Eurial kg", qty: 10, unit: "kg", price: 630, net: 5670, vat: 340 }]);
    expect((await w.open(b.review.id)).lines[0]).toMatchObject({ stockItemId: "mozz-b", autoResolved: true, conversionFactor: 1000 });
    const versions = await w.presentations.history(ORG, SUP, "ref:44641004");
    expect(versions.map((p) => [p.stockItemId, p.toProps().supersededAt === null])).toEqual([["mozz-b", true], ["mozz", false]]);
  });

  test("embalagem nova (1 kg → 500 g, mesma referência): não aplica, pergunta uma vez; confirmada, as seguintes resolvem-se e o histórico fica", async () => {
    const w = world();
    await w.savePresentation.execute({ organizationId: ORG, supplierId: SUP, supplierReference: "MZ-01", description: "Mozzarella saco 1 kg", stockItemId: "mozz", packageUnit: "saco", contentQuantity: 1, contentUnit: "kg", invoicedBy: "package", actor: "stock@teste.pt" });
    const ok = w.invoice([{ code: "MZ-01", description: "Mozzarella saco 1 kg", qty: 6, unit: "un", price: 700, net: 4200, vat: 252 }]);
    expect((await w.open(ok.review.id)).lines[0]).toMatchObject({ autoResolved: true, conversionFactor: 1000, stockQuantity: 6000 });

    const changed = w.invoice([{ code: "MZ-01", description: "Mozzarella saco 500g", qty: 6, unit: "un", price: 380, net: 2280, vat: 137 }]);
    const asked = (await w.open(changed.review.id)).lines[0]!;
    expect(asked).toMatchObject({ resolutionType: "unresolved", suggestion: { packagingChanged: true, conversionFactor: null } });

    await w.savePresentation.execute({ organizationId: ORG, supplierId: SUP, supplierReference: "MZ-01", description: "Mozzarella saco 500g", stockItemId: "mozz", packageUnit: "saco", contentQuantity: 500, contentUnit: "g", invoicedBy: "package", actor: "stock@teste.pt" });
    const next = w.invoice([{ code: "MZ-01", description: "Mozzarella saco 500g", qty: 4, unit: "un", price: 390, net: 1560, vat: 94 }]);
    expect((await w.open(next.review.id)).lines[0]).toMatchObject({ autoResolved: true, conversionFactor: 500, stockQuantity: 2000 });
    // A linha da fatura anterior já confirmada não muda (snapshot): 6 sacos de 1 kg = 6000 g.
    expect((await w.repository.findLinesByReviewId(ORG, ok.review.id))[0]!.toProps().stockQuantity).toBe(6000);
    expect((await w.presentations.history(ORG, SUP, "ref:MZ-01")).length).toBe(2);
  });

  test("Dream Plus FT 56892: com as embalagens confirmadas, mozzarella (20 kg = 8 sacos) e tomate (4 sacos × 5 kg) resolvem-se; cheddar sem associação pergunta", async () => {
    const w = world();
    await w.savePresentation.execute({ organizationId: ORG, supplierId: SUP, supplierReference: "44641004", description: "Q. Mozzarella ralado 100% Eurial kg", stockItemId: "mozz", packageUnit: "saco", contentQuantity: 2.5, contentUnit: "kg", invoicedBy: "content", actor: "s" });
    await w.savePresentation.execute({ organizationId: ORG, supplierId: SUP, supplierReference: "8005110551383", description: "Tomate Mutti p/ Pizza Classico 5 kg bolsa", stockItemId: "tomate", packageUnit: "saco", contentQuantity: 5, contentUnit: "kg", invoicedBy: "package", actor: "s" });
    const inv = w.invoice([
      { code: "020051000R", description: "Q. Cheddar Ralado kg", qty: 5, unit: "kg", price: 820, net: 3895, vat: 234 },
      { code: "44641004", description: "Q. Mozzarella ralado 100% Eurial kg", qty: 20, unit: "kg", price: 620, net: 11160, vat: 670 },
      { code: "8005110551383", description: "Tomate Mutti p/ Pizza Classico 5 kg bolsa", qty: 4, unit: "un", price: 1068, net: 3845, vat: 884 },
    ]);
    const dto = await w.open(inv.review.id);
    expect(dto.lines.map((l) => [l.description.slice(0, 14), l.resolutionType, l.stockQuantity])).toEqual([
      ["Q. Cheddar Ral", "unresolved", null],
      ["Q. Mozzarella ", "existing_item", 20000],
      ["Tomate Mutti p", "existing_item", 20],
    ]);
    const mozz = dto.lines[1]!;
    expect(mozz.unitCostPerBaseUnitWithoutVat).toBeCloseTo(0.558, 9); // cêntimos por g = 0,00558 €/g
    expect(mozz.unitCostPerBaseUnitWithoutVat! * 0.01).toBeCloseTo(0.00558, 9); // 0,01 g = 0,0000558 €
    expect(dto.lines[2]!.unitCostPerBaseUnitWithoutVat).toBeCloseTo(192.25, 9); // 1,9225 €/kg
    expect(dto.status).toBe("partial");
  });

  test("EAN já confirmado noutro fornecedor: só proposta (não se aplica sozinho, sem copiar preços)", async () => {
    const w = world();
    w.learned.learned.push({ supplierId: "sup-outro", supplierReference: "8005110551383", normalizedDescription: "tomate mutti", resolutionType: "existing_item", stockItemId: "tomate", conversionFactor: 5, purchaseUnit: "un" });
    const inv = w.invoice([{ code: "8005110551383", description: "Polpa tomate Mutti 5kg", qty: 2, unit: "un", price: 1100, net: 2200, vat: 506 }]);
    expect((await w.open(inv.review.id)).lines[0]).toMatchObject({ resolutionType: "unresolved", suggestion: { source: "learned", stockItemId: "tomate", conversionFactor: 5, confidence: 0.9 } });
  });

  test("«Não é item de stock» confirmado também se aplica sozinho; e desativa a embalagem que existisse", async () => {
    const w = world();
    await w.savePresentation.execute({ organizationId: ORG, supplierId: SUP, supplierReference: "CX-9", description: "Caixa térmica", stockItemId: "natas", packageUnit: null, contentQuantity: 1, contentUnit: "l", invoicedBy: "content", actor: "s" });
    const a = w.invoice([{ code: "CX-9", description: "Caixa térmica", qty: 1, unit: "un", price: 900, net: 900, vat: 207 }]);
    const dto = await w.open(a.review.id);
    await w.resolve.execute({ organizationId: ORG, reviewId: a.review.id, lineId: a.lines[0]!.id, expectedVersion: dto.version, resolution: "no_stock_effect", actor: "s" });
    expect(await w.presentations.findActive(ORG, SUP, "ref:CX-9")).toBeNull();
    const b = w.invoice([{ code: "CX-9", description: "Caixa térmica", qty: 2, unit: "un", price: 950, net: 1900, vat: 437 }]);
    expect((await w.open(b.review.id)).lines[0]).toMatchObject({ resolutionType: "no_stock_effect", autoResolved: true });
  });
});

describe("auxiliares", () => {
  test("EAN com dígito de controlo; conflito de tamanho só com tamanho explícito diferente", () => {
    expect([isEan("8005110551383"), isEan("8005110551384"), isEan("44641004"), isEan("020051000R")]).toEqual([true, false, false, false]);
    const saco = { packageUnit: "saco", contentQuantity: 2.5, contentUnit: "kg" as const };
    expect(packageSizeConflict("Q. Mozzarella ralado 100% Eurial kg", saco)).toBe(false);
    expect(packageSizeConflict("Mozzarella saco 2,5 kg", saco)).toBe(false);
    expect(packageSizeConflict("Mozzarella saco 2500g", saco)).toBe(false);
    expect(packageSizeConflict("Mozzarella saco 1 kg", saco)).toBe(true);
    expect(packageSizeConflict("Natas 1L", saco)).toBe(true);
  });
});
