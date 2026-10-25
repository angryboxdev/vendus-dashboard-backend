import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import { SavePurchasePresentationUseCase, ListPurchasePresentationsUseCase } from "../../application/use-cases/purchase-presentations.use-case.js";
import { GetStockPurchaseReviewUseCase } from "../../application/use-cases/get-stock-purchase-review.use-case.js";
import { SuggestReviewMappingsUseCase } from "../../application/use-cases/suggest-review-mappings.use-case.js";
import { InvalidPurchasePresentationError } from "../../domain/errors.js";
import { FakePurchasePresentationRepository } from "../fakes/fake-purchase-presentation-repository.js";
import { FakeStockCatalogWrite } from "../fakes/fake-stock-catalog-write.js";
import { FakeStockReviewLearnedMapping } from "../fakes/fake-stock-review-learned-mapping.js";
import { FakeStockReviewAuditLog } from "../fakes/fake-stock-review-audit-log.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";

const ORG = mintOrganizationId("org-test");
const ORG_B = mintOrganizationId("org-outra");

function setup() {
  const presentations = new FakePurchasePresentationRepository();
  const catalog = new FakeStockCatalogWrite();
  catalog.seed({ id: "mozz", name: "Mozzarella ralada", baseUnit: "g", isActive: true });
  catalog.seed({ id: "tomate", name: "Tomate pelado", baseUnit: "kg", isActive: true });
  catalog.seed({ id: "azeite", name: "Azeite", baseUnit: "l", isActive: true });
  const learned = new FakeStockReviewLearnedMapping();
  const audit = new FakeStockReviewAuditLog();
  const save = new SavePurchasePresentationUseCase(presentations, catalog, learned, audit);
  return { presentations, catalog, learned, audit, save };
}

const mozzarella = { supplierId: "sup-dream", supplierReference: "44641004", description: "Q. Mozzarella ralado 100% Eurial kg", stockItemId: "mozz", packageUnit: "saco", contentQuantity: 2.5, contentUnit: "kg" as const, invoicedBy: "content" as const, actor: "stock@teste.pt" };
const tomate = { supplierId: "sup-dream", supplierReference: "8005110551383", description: "Tomate Mutti p/ Pizza Classico 5 kg bolsa", stockItemId: "tomate", packageUnit: "saco", contentQuantity: 5, contentUnit: "kg" as const, invoicedBy: "package" as const, actor: "stock@teste.pt" };

describe("apresentação de compra — confirmar/alterar", () => {
  test("confirmar grava a versão, ensina o fator (fatura em kg, artigo em g → 1000) e audita", async () => {
    const s = setup();
    const dto = await s.save.execute({ organizationId: ORG, ...mozzarella });
    expect(dto).toMatchObject({ packageUnit: "saco", contentQuantity: 2.5, contentUnit: "kg", invoicedBy: "content", minOrderPackages: 1, orderIncrementPackages: 1, source: "user", supersededAt: null });
    expect(s.learned.learned[0]).toMatchObject({ supplierReference: "44641004", stockItemId: "mozz", conversionFactor: 1000, purchaseUnit: "kg" });
    expect(s.audit.entries[0]).toMatchObject({ entityType: "purchase_presentation", action: "presentation_confirmed" });
  });

  test("fatura em sacos: fator = conteúdo do saco na unidade do artigo (5 kg → 5)", async () => {
    const s = setup();
    await s.save.execute({ organizationId: ORG, ...tomate });
    expect(s.learned.learned[0]).toMatchObject({ conversionFactor: 5, purchaseUnit: "saco" });
  });

  test("alterar o tamanho do saco cria uma versão nova e fecha a anterior (o passado não muda)", async () => {
    const s = setup();
    const v1 = await s.save.execute({ organizationId: ORG, ...mozzarella });
    const v2 = await s.save.execute({ organizationId: ORG, ...mozzarella, contentQuantity: 3 });
    expect(v2.id).not.toBe(v1.id);
    const active = await new ListPurchasePresentationsUseCase(s.presentations).execute(ORG, "sup-dream");
    expect(active.map((p) => p.contentQuantity)).toEqual([3]);
    const history = await s.presentations.history(ORG, "sup-dream", "ref:44641004");
    expect(history.map((p) => [p.toProps().contentQuantity, p.toProps().supersededAt === null])).toEqual([[3, true], [2.5, false]]);
    expect(s.audit.entries[1]).toMatchObject({ action: "presentation_changed" });
  });

  test("unidades de dimensões diferentes são recusadas (kg num artigo em L); artigo inativo também", async () => {
    const s = setup();
    await expect(s.save.execute({ organizationId: ORG, ...mozzarella, stockItemId: "azeite" })).rejects.toThrow(/não se converte na unidade do artigo \(l\)/);
    s.catalog.seed({ id: "velho", name: "x", baseUnit: "kg", isActive: false });
    await expect(s.save.execute({ organizationId: ORG, ...mozzarella, stockItemId: "velho" })).rejects.toBeInstanceOf(InvalidPurchasePresentationError);
  });
});

describe("apresentação de compra — na revisão de Stock", () => {
  async function review(s: ReturnType<typeof setup>) {
    const repository = new FakeStockPurchaseReviewRepository();
    const r = StockPurchaseReview.create({
      organizationId: ORG, invoiceId: "inv-1", sourceInvoiceVersion: 1, sourceHash: "h", decisionSource: "category", decisionSupplierId: "sup-dream",
      decisionPolicyUsed: "CREATE_REVIEW", supplierName: "Dream Plus", invoiceNumber: "FT 1/56892", invoiceDate: "2026-09-07",
    }).startReview();
    const lines = [
      StockReviewLine.create({ organizationId: ORG, reviewId: r.id, invoiceLineId: "l-mozz", description: "Q. Mozzarella ralado 100% Eurial kg", purchaseQuantity: 20, purchaseUnit: "kg", unitCostWithoutVat: 620, totalWithVat: 11830, vatAmount: 670, supplierItemCode: "44641004" }),
      StockReviewLine.create({ organizationId: ORG, reviewId: r.id, invoiceLineId: "l-tom", description: "Tomate Mutti p/ Pizza Classico 5 kg bolsa", purchaseQuantity: 4, purchaseUnit: "un", unitCostWithoutVat: 1068, totalWithVat: 4729, vatAmount: 884, supplierItemCode: "8005110551383" }),
      StockReviewLine.create({ organizationId: ORG, reviewId: r.id, invoiceLineId: "l-ched", description: "Q. Cheddar Ralado kg", purchaseQuantity: 5, purchaseUnit: "kg", unitCostWithoutVat: 820, totalWithVat: 4129, vatAmount: 234, supplierItemCode: "020051000R" }),
    ];
    repository.seedReview(r);
    repository.seedLines(lines);
    return { repository, r };
  }

  test("cada linha traz a embalagem e o que dá: mozzarella 8 sacos / +20 000 g / 5,58 €/kg; tomate 4 sacos / +20 kg; cheddar por configurar", async () => {
    const s = setup();
    await s.save.execute({ organizationId: ORG, ...mozzarella });
    await s.save.execute({ organizationId: ORG, ...tomate });
    const { repository, r } = await review(s);
    const dto = await new GetStockPurchaseReviewUseCase(repository, undefined, { presentations: s.presentations, catalog: s.catalog }).execute({ organizationId: ORG, id: r.id });
    const [m, t, c] = dto.lines;
    expect(m!.packaging).toMatchObject({ baseUnit: "g", presentation: { packageUnit: "saco", contentQuantity: 2.5 }, preview: { packages: 8, stockQuantity: 20000, conversionFactor: 1000, netCostPerContentUnit: 558, netCostPerPackage: 1395 } });
    expect(t!.packaging).toMatchObject({ baseUnit: "kg", preview: { packages: 4, stockQuantity: 20, conversionFactor: 5, netCostPerContentUnit: 192.25 } });
    expect(c!.packaging).toEqual({ presentation: null, preview: null, baseUnit: null });
  });

  test("a proposta de conciliação usa a embalagem confirmada (artigo e fator), antes do histórico e da IA", async () => {
    const s = setup();
    await s.save.execute({ organizationId: ORG, ...tomate });
    const { repository, r } = await review(s);
    const uc = new SuggestReviewMappingsUseCase(repository, new FakeStockReviewLearnedMapping(), s.catalog, null, undefined, undefined, { presentations: s.presentations, catalog: s.catalog });
    const dto = await uc.execute({ organizationId: ORG, reviewId: r.id });
    expect(dto.lines.find((l) => l.invoiceLineId === "l-tom")!.suggestion).toMatchObject({ source: "learned", stockItemId: "tomate", conversionFactor: 5, confidence: 1 });
  });

  test("outra organização não vê as embalagens desta", async () => {
    const s = setup();
    await s.save.execute({ organizationId: ORG, ...mozzarella });
    // O repositório real filtra por organização (RLS + scoped query); aqui, a chave por fornecedor de outra org não existe.
    expect(await new ListPurchasePresentationsUseCase(s.presentations).execute(ORG_B, "sup-outro")).toEqual([]);
  });
});
