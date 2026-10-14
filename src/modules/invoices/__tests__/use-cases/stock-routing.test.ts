import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ConfirmImportedInvoiceUseCase } from "../../application/use-cases/confirm-imported-invoice.use-case.js";
import { CreateInvoiceUseCase } from "../../application/use-cases/create-invoice.use-case.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { StockDecisionRequiredError } from "../../domain/errors.js";
import { FakeFiscalIdentityPort } from "../fakes/fake-fiscal-identity.port.js";
import { FakeInvoiceAmountsWrite } from "../fakes/fake-invoice-amounts-write.js";
import { FakeInvoiceAudit } from "../fakes/fake-invoice-audit.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";
import { FakeStockRoutingPort } from "../fakes/fake-stock-routing.port.js";
import { FakeSupplierCreatePort } from "../fakes/fake-supplier-create.port.js";
import { FakeSupplierHintPort } from "../fakes/fake-supplier-hint.port.js";
import { FakeSupplierLookupPort } from "../fakes/fake-supplier-lookup.port.js";

const ORG = mintOrganizationId("org-test");
const notified: { override: string; overrideReason: string | null }[] = [];
const notify = { notifyInvoiceFinalized: async (_o: unknown, n: { override: string; overrideReason: string | null }) => void notified.push(n) };
const draft = () =>
  Invoice.createFromImport({
    supplierId: "sup-makro",
    supplierName: "Makro",
    supplierNifSnapshot: "503504564",
    invoiceNumber: "FT 1",
    invoiceDate: new Date("2026-10-01"),
    dueDate: new Date("2026-10-31"),
    subtotalWithoutVat: 1000,
    totalVat: 230,
    totalWithVat: 1230,
    source: "pdf_import",
    attachmentUrl: null,
    aiConfidence: 0.9,
    requiresReview: false,
  });
const line = { description: "Farinha", quantity: 1, unitCostWithoutVat: 1000, vatRate: 23, vatAmount: 230, totalWithVat: 1230, locationId: "loc-mbs" };

function setup() {
  const invoiceRepo = new FakeInvoiceRepository();
  const routing = new FakeStockRoutingPort();
  const suppliers = new FakeSupplierLookupPort();
  suppliers.seed([{ id: "sup-makro", name: "Makro", nif: "503504564", defaultCostCenterGroupId: null, defaultCostCenterCategoryId: null, defaultFinancialType: null, defaultLocationId: "loc-default" }]);
  const confirm = new ConfirmImportedInvoiceUseCase(invoiceRepo, new FakeInvoiceLineRepository(), new FakePayableEntryWrite(), new FakeSupplierCreatePort(), new FakeSupplierHintPort(), notify, new FakeFiscalIdentityPort(), suppliers, new FakeInvoiceAmountsWrite(), new FakeInvoiceAudit(), routing);
  const create = new CreateInvoiceUseCase(invoiceRepo, new FakeInvoiceLineRepository(), new FakePayableEntryWrite(), notify, new FakeFiscalIdentityPort(), suppliers, new FakeInvoiceAmountsWrite(), new FakeInvoiceAudit(), routing);
  return { invoiceRepo, routing, confirm, create };
}

describe("«Enviar para Stock» ao lançar (F2 §2.1)", () => {
  beforeEach(() => void (notified.length = 0));

  test("pedido automático aplica a sugestão (exceção da loja) e grava a decisão explícita com o motivo", async () => {
    const s = setup();
    const inv = draft();
    await s.invoiceRepo.save(ORG, inv);
    s.routing.next = { send: false, source: "supplier_location", reason: "Exceção desta loja no fornecedor: não enviar", requiresDecision: false };
    const r = await s.confirm.execute({ organizationId: ORG, id: inv.id, lines: [line] });
    expect(s.routing.calls[0]).toMatchObject({ supplierId: "sup-makro", locationId: "loc-mbs" });
    expect(r).toMatchObject({ stockReviewOverride: "force_skip", stockReviewOverrideReason: "Exceção desta loja no fornecedor: não enviar" });
    expect(notified[0]).toMatchObject({ override: "force_skip" });
  });

  test("sem loja nas linhas usa o destino habitual do fornecedor", async () => {
    const s = setup();
    s.routing.next = { send: true, source: "supplier", reason: "Predefinição do fornecedor: enviar por defeito", requiresDecision: false };
    const r = await s.create.execute({ organizationId: ORG, supplierId: "sup-makro", supplierName: "Makro", invoiceNumber: "FT 2", invoiceDate: "2026-10-01", subtotalWithoutVat: 1000, totalVat: 230, totalWithVat: 1230 });
    expect(s.routing.calls[0]).toMatchObject({ locationId: "loc-default" });
    expect(r.stockReviewOverride).toBe("force_create");
  });

  test("«Decidir no documento» sem escolha é recusado e o rascunho fica intacto; com escolha explícita lança", async () => {
    const s = setup();
    const inv = draft();
    await s.invoiceRepo.save(ORG, inv);
    s.routing.next = { send: null, source: "supplier", reason: "Predefinição do fornecedor: decidir no documento", requiresDecision: true };
    await expect(s.confirm.execute({ organizationId: ORG, id: inv.id })).rejects.toMatchObject({ code: "decision_required" });
    expect((await s.invoiceRepo.findById(ORG, inv.id))!.status).toBe("draft_ai");
    const r = await s.confirm.execute({ organizationId: ORG, id: inv.id, stockReviewOverride: "force_create" });
    expect(r.stockReviewOverride).toBe("force_create");
  });

  test("desmarcar contra a predefinição exige motivo curto", async () => {
    const s = setup();
    s.routing.next = { send: true, source: "category", reason: "A subcategoria tem impacto em stock", requiresDecision: false };
    const base = { organizationId: ORG, supplierId: "sup-makro", supplierName: "Makro", invoiceDate: "2026-10-01", subtotalWithoutVat: 1000, totalVat: 230, totalWithVat: 1230, stockReviewOverride: "force_skip" as const };
    await expect(s.create.execute({ ...base, invoiceNumber: "FT 3" })).rejects.toBeInstanceOf(StockDecisionRequiredError);
    const r = await s.create.execute({ ...base, invoiceNumber: "FT 4", stockReviewOverrideReason: "Equipamento, não é stock" });
    expect(r).toMatchObject({ stockReviewOverride: "force_skip", stockReviewOverrideReason: "Equipamento, não é stock" });
  });

  test("sem sinal mantém «automático» (comportamento anterior)", async () => {
    const s = setup();
    const r = await s.create.execute({ organizationId: ORG, supplierName: "Outro", invoiceNumber: "X 1", invoiceDate: "2026-10-01", subtotalWithoutVat: 100, totalVat: 23, totalWithVat: 123 });
    expect(r.stockReviewOverride).toBe("auto");
  });
});
