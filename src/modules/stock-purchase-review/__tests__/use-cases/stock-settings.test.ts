import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import { ConfirmStockPurchaseReviewUseCase } from "../../application/use-cases/confirm-stock-purchase-review.use-case.js";
import { StockSettingsUseCase, resolveEntryLocation } from "../../application/use-cases/stock-settings.use-case.js";
import { InvalidStockSettingsError, LocationRequiredError } from "../../domain/errors.js";
import { FakeStockPurchaseReviewRepository } from "../fakes/fake-stock-purchase-review-repository.js";
import { FakeStockMovementWrite } from "../fakes/fake-stock-movement-write.js";
import { FakeInvoiceRead } from "../fakes/fake-invoice-read.js";
import { FakeLocationRead } from "../fakes/fake-location-read.js";
import { FakeStockReviewAuditLog } from "../fakes/fake-stock-review-audit-log.js";
import { FakeStockSettingsRepository } from "../fakes/fake-stock-settings-repository.js";

const ORG = mintOrganizationId("org-test");
const ORG_B = mintOrganizationId("org-outra");
const lojaA = { id: "loc-a", name: "Loja A", isActive: true };
const lojaB = { id: "loc-b", name: "Loja B", isActive: true };

describe("localização principal do Stock (V5 §2.4)", () => {
  test("resolução: indicada → única loja → principal ativa; várias sem principal → nenhuma (nunca ao acaso)", () => {
    expect(resolveEntryLocation("loc-x", [lojaA, lojaB], null)).toBe("loc-x");
    expect(resolveEntryLocation(null, [lojaA], null)).toBe("loc-a");
    expect(resolveEntryLocation(null, [lojaA, lojaB], "loc-b")).toBe("loc-b");
    expect(resolveEntryLocation(null, [lojaA, lojaB], "loc-inativa")).toBeNull();
    expect(resolveEntryLocation(null, [lojaA, lojaB], null)).toBeNull();
  });

  test("gravar: só lojas ativas da empresa, auditado, por empresa", async () => {
    const repo = new FakeStockSettingsRepository();
    const locations = new FakeLocationRead();
    locations.locations = [lojaA, lojaB, { id: "loc-fechada", name: "Fechada", isActive: false }];
    const audit = new FakeStockReviewAuditLog();
    const uc = new StockSettingsUseCase(repo, locations, audit);
    expect(await uc.save({ organizationId: ORG, defaultLocationId: "loc-b", actor: "gestor@teste.pt" })).toEqual({ defaultLocationId: "loc-b", locations: [{ id: "loc-a", name: "Loja A" }, { id: "loc-b", name: "Loja B" }] });
    expect(audit.entries[0]).toMatchObject({ entityType: "stock_settings", action: "default_location_changed", before: { defaultLocationId: null }, after: { defaultLocationId: "loc-b" } });
    await expect(uc.save({ organizationId: ORG, defaultLocationId: "loc-fechada", actor: "x" })).rejects.toBeInstanceOf(InvalidStockSettingsError);
    expect((await uc.get(ORG_B)).defaultLocationId).toBeNull();
  });

  async function confirmWith(locations: typeof lojaA[], defaultLocationId: string | null) {
    const repository = new FakeStockPurchaseReviewRepository();
    const write = new FakeStockMovementWrite(repository);
    const locationRead = new FakeLocationRead();
    locationRead.locations = locations;
    const settings = new FakeStockSettingsRepository();
    if (defaultLocationId) settings.byOrg.set(ORG, defaultLocationId);
    const review = StockPurchaseReview.create({
      organizationId: ORG, invoiceId: "inv-1", sourceInvoiceVersion: 1, sourceHash: "h", decisionSource: "category",
      decisionPolicyUsed: "CREATE_REVIEW", supplierName: "Dream Plus", invoiceNumber: "FT 1", invoiceDate: "2026-10-05",
    }).startReview().refreshLinesProgress(true, true);
    repository.seedReview(review);
    repository.seedLines([
      StockReviewLine.create({ organizationId: ORG, reviewId: review.id, invoiceLineId: "l1", description: "Q. Cheddar Ralado kg", purchaseQuantity: 6, purchaseUnit: "un", unitCostWithoutVat: 820, totalWithVat: 4954, vatAmount: 280, supplierItemCode: null })
        .resolveToStockItem({ stockItemId: "cheddar", conversionFactor: 1000, isItemActive: true }, false, "gestor@teste.pt"),
    ]);
    const uc = new ConfirmStockPurchaseReviewUseCase(repository, write, new FakeInvoiceRead(), locationRead, new FakeStockReviewAuditLog(), undefined, undefined, settings);
    return { run: () => uc.execute({ organizationId: ORG, id: review.id, expectedVersion: review.version, actor: "gestor@teste.pt" }), write };
  }

  test("T21: uma só loja → entra nela sem perguntar", async () => {
    const { run, write } = await confirmWith([lojaA], null);
    expect((await run()).status).toBe("applied");
    expect(write.confirmCalls[0]?.fallbackLocationId).toBe("loc-a");
  });

  test("T22: várias lojas sem principal → recusa com indicação de configurar; com principal → entra nela", async () => {
    await expect((await confirmWith([lojaA, lojaB], null)).run()).rejects.toBeInstanceOf(LocationRequiredError);
    await expect((await confirmWith([lojaA, lojaB], null)).run()).rejects.toThrow(/localização principal/);
    const { run, write } = await confirmWith([lojaA, lojaB], "loc-b");
    expect((await run()).status).toBe("applied");
    expect(write.confirmCalls[0]?.fallbackLocationId).toBe("loc-b");
  });
});
