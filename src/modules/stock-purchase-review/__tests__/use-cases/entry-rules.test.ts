import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import { EntryRulesUseCase } from "../../application/use-cases/entry-rules.use-case.js";
import { SuggestReviewMappingsUseCase } from "../../application/use-cases/suggest-review-mappings.use-case.js";
import { DEFAULT_ENTRY_RULES, effectiveRules, modeForItemType } from "../../domain/services/entry-rules.service.js";
import { InvalidEntryRulesError } from "../../domain/errors.js";
import { FakeEntryRulesRepository } from "../fakes/fake-entry-rules-repository.js";
import { FakeStockReviewAuditLog } from "../fakes/fake-stock-review-audit-log.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";
import { FakeStockCatalogWrite } from "../fakes/fake-stock-catalog-write.js";
import { FakeStockReviewLearnedMapping } from "../fakes/fake-stock-review-learned-mapping.js";

const ORG = mintOrganizationId("org-test");
const ORG_B = mintOrganizationId("org-outra");

describe("regras de entrada no Stock (V4 §2)", () => {
  test("predefinições: Ingredientes/Bebidas/Embalagens entram; Higiene/Limpeza fora; Consumíveis/Outros/Desconhecidos por rever", () => {
    expect(DEFAULT_ENTRY_RULES).toEqual({ ingredient: "stock", beverage: "stock", packaging: "stock", cleaning: "no_stock", consumable: "review", other: "review", unknown: "review" });
    const r = effectiveRules({ cleaning: "stock" });
    expect([modeForItemType(r, "cleaning"), modeForItemType(r, "ingredient"), modeForItemType(r, null), modeForItemType(r, "tipo-novo")]).toEqual(["stock", "stock", "review", "review"]);
  });

  test("gravar: só tipos e modos conhecidos, auditado, por empresa (outra empresa mantém as predefinições)", async () => {
    const repo = new FakeEntryRulesRepository();
    const audit = new FakeStockReviewAuditLog();
    const uc = new EntryRulesUseCase(repo, audit);
    const after = await uc.save({ organizationId: ORG, rules: { cleaning: "stock", beverage: "review" }, actor: "gestor@teste.pt" });
    expect(after).toMatchObject({ cleaning: "stock", beverage: "review", ingredient: "stock" });
    expect(audit.entries[0]).toMatchObject({ entityType: "stock_entry_rules", action: "entry_rules_changed", before: { cleaning: "no_stock" }, after: { cleaning: "stock" } });
    expect(await uc.get(ORG_B)).toEqual(DEFAULT_ENTRY_RULES);
    await expect(uc.save({ organizationId: ORG, rules: { equipamento: "stock" } as never, actor: "x" })).rejects.toBeInstanceOf(InvalidEntryRulesError);
    await expect(uc.save({ organizationId: ORG, rules: { cleaning: "talvez" } as never, actor: "x" })).rejects.toThrow(/modo inválido/);
  });

  test("proposta para um artigo de Higiene/Limpeza passa a «Não é item de stock»; associação confirmada prevalece sobre a regra", async () => {
    const repository = new FakeStockPurchaseReviewRepository();
    const catalog = new FakeStockCatalogWrite();
    catalog.seed({ id: "lixivia", name: "Lixívia", baseUnit: "l", isActive: true, type: "cleaning" });
    catalog.seed({ id: "detergente", name: "Detergente loiça", baseUnit: "l", isActive: true, type: "cleaning" });
    const learned = new FakeStockReviewLearnedMapping();
    learned.learned.push({ supplierId: "sup-1", supplierReference: "DET-1", normalizedDescription: "detergente loiça 5l", resolutionType: "existing_item", stockItemId: "detergente", conversionFactor: 5, purchaseUnit: "un" });
    learned.activeItemIds.add("detergente");
    const review = StockPurchaseReview.create({
      organizationId: ORG, invoiceId: "inv-1", sourceInvoiceVersion: 1, sourceHash: "h", decisionSource: "category", decisionSupplierId: "sup-1",
      decisionPolicyUsed: "CREATE_REVIEW", supplierName: "Makro", invoiceNumber: "FT 1", invoiceDate: "2026-10-20",
    }).startReview();
    repository.seedReview(review);
    repository.seedLines([
      StockReviewLine.create({ organizationId: ORG, reviewId: review.id, invoiceLineId: "a", description: "Lixívia 5L", purchaseQuantity: 2, purchaseUnit: "un", unitCostWithoutVat: 300, totalWithVat: 738, vatAmount: 138, supplierItemCode: null }),
      StockReviewLine.create({ organizationId: ORG, reviewId: review.id, invoiceLineId: "b", description: "Detergente loiça 5L", purchaseQuantity: 1, purchaseUnit: "un", unitCostWithoutVat: 900, totalWithVat: 1107, vatAmount: 207, supplierItemCode: "DET-1" }),
    ]);
    const uc = new SuggestReviewMappingsUseCase(repository, learned, catalog, null, undefined, undefined, undefined, undefined, new FakeEntryRulesRepository());
    const dto = await uc.execute({ organizationId: ORG, reviewId: review.id });
    const [lix, det] = dto.lines;
    expect(lix).toMatchObject({ resolutionType: "unresolved", suggestion: { source: "name_match", resolution: "no_stock_effect", stockItemId: null } });
    // Decisão confirmada antes (associação do fornecedor) ganha à regra da empresa.
    expect(det).toMatchObject({ resolutionType: "existing_item", stockItemId: "detergente", autoResolved: true });
  });
});
