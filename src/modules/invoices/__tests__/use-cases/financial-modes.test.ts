import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ConfirmImportedInvoiceUseCase } from "../../application/use-cases/confirm-imported-invoice.use-case.js";
import { ListInvoiceAllocationsUseCase } from "../../application/use-cases/list-invoice-allocations.use-case.js";
import { ListInvoiceLinesUseCase } from "../../application/use-cases/list-invoice-lines.use-case.js";
import { ReplaceInvoiceAllocationsUseCase } from "../../application/use-cases/replace-invoice-allocations.use-case.js";
import { SaveInvoiceDraftUseCase } from "../../application/use-cases/save-invoice-draft.use-case.js";
import { UpdateInvoiceUseCase } from "../../application/use-cases/update-invoice.use-case.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { AllocationsNotReconciledError, InvoiceNotDraftError } from "../../domain/errors.js";
import type { CreateInvoiceLineCommand } from "../../domain/ports/in/invoice.ports.js";
import { FakeCostCenterCategoryReader } from "../fakes/fake-cost-center-category-reader.js";
import { FakeFiscalIdentityPort } from "../fakes/fake-fiscal-identity.port.js";
import { FakeInvoiceAllocationRepository } from "../fakes/fake-invoice-allocation-repository.js";
import { FakeInvoiceAmountsWrite } from "../fakes/fake-invoice-amounts-write.js";
import { FakeInvoiceAudit } from "../fakes/fake-invoice-audit.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakeInvoiceReconciliationCleanup } from "../fakes/fake-invoice-reconciliation-cleanup.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceStockReviewDraftDelete } from "../fakes/fake-invoice-stock-review-draft-delete.js";
import { FakeInvoiceStockReviewStatusRead } from "../fakes/fake-invoice-stock-review-status-read.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";
import { FakeStockRoutingPort } from "../fakes/fake-stock-routing.port.js";
import { FakeSupplierCreatePort } from "../fakes/fake-supplier-create.port.js";
import { FakeSupplierHintPort } from "../fakes/fake-supplier-hint.port.js";
import { FakeSupplierLookupPort } from "../fakes/fake-supplier-lookup.port.js";

const ORG = mintOrganizationId("org-test");
const notified: { lines: { costCenterCategoryId: string | null }[] }[] = [];
const notify = { notifyInvoiceFinalized: async (_o: unknown, n: { lines: { costCenterCategoryId: string | null }[] }) => void notified.push(n) };

// Makro: 650 € de base líquida, IVA 23% = 149,50 €, total 799,50 €.
const draft = () =>
  Invoice.createFromImport({
    supplierName: "Makro",
    supplierNifSnapshot: "503504564",
    invoiceNumber: "FT 650",
    invoiceDate: new Date("2026-10-01"),
    dueDate: new Date("2026-10-31"),
    subtotalWithoutVat: 65000,
    totalVat: 14950,
    totalWithVat: 79950,
    source: "pdf_import",
    attachmentUrl: null,
    aiConfidence: 0.9,
    requiresReview: false,
  });
const line = (description: string, cents: number): CreateInvoiceLineCommand => ({ description, quantity: 1, unitCostWithoutVat: cents, vatRate: 23, vatAmount: 0, totalWithVat: cents });
const realLines = [line("Água 1,5L ×24", 10000), line("Batedeira industrial", 25000), line("Farinha T55 25kg", 30000)];
const split = (equip = 25000) => [
  { description: "Bebidas", costCenterCategoryId: "cat-bebidas", netCents: 10000 },
  { description: "Equipamentos", costCenterCategoryId: "cat-equip", netCents: equip },
  { description: "Ingredientes", costCenterCategoryId: "cat-ingred", netCents: 30000 },
];

function setup() {
  const invoiceRepo = new FakeInvoiceRepository();
  const lineRepo = new FakeInvoiceLineRepository();
  const payableWrite = new FakePayableEntryWrite();
  const allocationRepo = new FakeInvoiceAllocationRepository();
  const categories = new FakeCostCenterCategoryReader();
  for (const [id, name, groupId] of [["cat-bebidas", "Bebidas", "grp-cmv"], ["cat-equip", "Equipamentos", "grp-capex"], ["cat-ingred", "Ingredientes", "grp-cmv"]] as const) {
    categories.seedLookup({ id, code: name.slice(0, 3).toUpperCase(), name, financialType: "cmv", groupId, isActive: true });
  }
  categories.seedLookup({ id: "cat-old", code: "OLD", name: "Antiga", financialType: "cmv", groupId: "grp-cmv", isActive: false });
  const audit = new FakeInvoiceAudit();
  const amountsWrite = new FakeInvoiceAmountsWrite();
  const confirm = new ConfirmImportedInvoiceUseCase(invoiceRepo, lineRepo, payableWrite, new FakeSupplierCreatePort(), new FakeSupplierHintPort(), notify, new FakeFiscalIdentityPort(), new FakeSupplierLookupPort(), amountsWrite, audit, new FakeStockRoutingPort(), categories, allocationRepo);
  const saveDraft = new SaveInvoiceDraftUseCase(invoiceRepo, lineRepo, amountsWrite, categories, allocationRepo, audit);
  const update = new UpdateInvoiceUseCase(invoiceRepo, lineRepo, payableWrite, new FakeInvoiceReconciliationCleanup(), new FakeInvoiceStockReviewStatusRead(), new FakeInvoiceStockReviewDraftDelete(), new FakeFiscalIdentityPort(), new FakeSupplierLookupPort(), audit, allocationRepo);
  const replace = new ReplaceInvoiceAllocationsUseCase(invoiceRepo, categories, allocationRepo, audit);
  return { invoiceRepo, lineRepo, payableWrite, allocationRepo, confirm, saveDraft, update, replace, amountsWrite };
}

describe("Modos financeiros «Única | Por artigo | Por valores» (F2 §2.2)", () => {
  beforeEach(() => void (notified.length = 0));

  test("Por valores: 100 + 250 + 300 = 650 € de base líquida; as repartições não são artigos e as linhas reais ficam todas", async () => {
    const s = setup();
    const inv = draft();
    await s.invoiceRepo.save(ORG, inv);
    const r = await s.confirm.execute({ organizationId: ORG, id: inv.id, financialMode: "by_values", lines: realLines, allocations: split() });
    expect(r).toMatchObject({ financialMode: "by_values", lineDetailMode: "by_values", subtotalWithoutVat: 65000, totalVat: 14950, costCenterCategoryId: null });
    expect(r.allocations!.map((a) => a.netCents)).toEqual([10000, 25000, 30000]);
    expect(r.classificationSummary).toMatchObject({ mode: "mixed", basis: "net" });
    // Linhas reais preservadas (disponíveis para o Stock), com IVA por linha do motor.
    expect(await s.lineRepo.findByInvoiceId(ORG, inv.id)).toHaveLength(3);
    expect(notified[0]!.lines).toHaveLength(3);
  });

  test.each([64900, 65100])("total distribuído %i ≠ 65000 bloqueia lançar, com «Por distribuir»", async (total) => {
    const s = setup();
    const inv = draft();
    await s.invoiceRepo.save(ORG, inv);
    const err = await s.confirm.execute({ organizationId: ORG, id: inv.id, financialMode: "by_values", lines: realLines, allocations: split(25000 + total - 65000) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AllocationsNotReconciledError);
    expect(err).toMatchObject({ details: { remainingCents: 65000 - total } });
    expect((await s.invoiceRepo.findById(ORG, inv.id))!.status).toBe("draft_ai");
    expect(s.payableWrite.created ?? []).toEqual([]);
  });

  test("Por valores com desconto: os montantes já são líquidos (não se desconta de novo cada categoria)", async () => {
    const s = setup();
    const inv = draft();
    await s.invoiceRepo.save(ORG, inv);
    // Linhas brutas 722,22 € com 10% global → base 650 €.
    const grossLines = [line("Água", 11111), line("Batedeira", 27778), line("Farinha", 33333)];
    const r = await s.confirm.execute({ organizationId: ORG, id: inv.id, financialMode: "by_values", lines: grossLines, allocations: split(), amounts: { globalDiscount: { kind: "pct", value: 10 } } });
    expect(r.subtotalWithoutVat).toBe(65000);
    expect(r.allocations!.reduce((t, a) => t + a.netCents, 0)).toBe(65000);
  });

  test("subcategoria inválida (inativa / fora do grupo) bloqueia; não é preciso SKU nem quantidade", async () => {
    const s = setup();
    const inv = draft();
    await s.invoiceRepo.save(ORG, inv);
    const bad = [{ description: "Tudo", costCenterCategoryId: "cat-old", netCents: 65000 }];
    await expect(s.confirm.execute({ organizationId: ORG, id: inv.id, financialMode: "by_values", allocations: bad })).rejects.toThrow(/inativa/);
    const wrongGroup = [{ description: "Tudo", costCenterGroupId: "grp-cmv", costCenterCategoryId: "cat-equip", netCents: 65000 }];
    await expect(s.confirm.execute({ organizationId: ORG, id: inv.id, financialMode: "by_values", allocations: wrongGroup })).rejects.toThrow(/fora do grupo/);
    // Sem linhas extraídas: a base é a do cabeçalho; lança com uma repartição só.
    const ok = await s.confirm.execute({ organizationId: ORG, id: inv.id, financialMode: "by_values", allocations: [{ description: "Tudo", costCenterCategoryId: "cat-ingred", netCents: 65000 }] });
    expect(ok.allocations).toHaveLength(1);
  });

  test("«Guardar rascunho»: grava linhas, modo e repartições incompletas, sem obrigação nem revisão de Stock; lançar depois usa o guardado", async () => {
    const s = setup();
    const inv = draft();
    await s.invoiceRepo.save(ORG, inv);
    const partial = split().slice(0, 2);
    const saved = await s.saveDraft.execute({ organizationId: ORG, id: inv.id, financialMode: "by_values", lines: realLines, allocations: partial });
    expect(saved).toMatchObject({ remainingCents: 30000, readyToFinalize: false });
    expect(saved.invoice.status).toBe("draft_ai");
    expect(s.payableWrite.created ?? []).toEqual([]);
    expect(notified).toHaveLength(0);
    expect(await s.lineRepo.findByInvoiceId(ORG, inv.id)).toHaveLength(3);
    // Lançar sem reenviar linhas: as do rascunho são usadas (não duplicadas).
    const r = await s.confirm.execute({ organizationId: ORG, id: inv.id, financialMode: "by_values", allocations: split(), saveAsPayable: true });
    expect(await s.lineRepo.findByInvoiceId(ORG, inv.id)).toHaveLength(3);
    expect(r.status).toBe("pending");
    expect(s.payableWrite.created).toHaveLength(1);
    // Depois de lançada, deixa de ser rascunho.
    await expect(s.saveDraft.execute({ organizationId: ORG, id: inv.id })).rejects.toBeInstanceOf(InvoiceNotDraftError);
  });

  test("mudar a base de uma fatura «Por valores» reabre a conferência (não redistribui em silêncio)", async () => {
    const s = setup();
    const inv = draft();
    await s.invoiceRepo.save(ORG, inv);
    await s.confirm.execute({ organizationId: ORG, id: inv.id, financialMode: "by_values", allocations: split() });
    await expect(s.update.execute({ organizationId: ORG, id: inv.id, subtotalWithoutVat: 60000, totalVat: 13800, totalWithVat: 73800 })).rejects.toMatchObject({ details: { remainingCents: -5000 } });
    expect((await s.allocationRepo.findByInvoiceId(ORG, inv.id)).map((a) => a.netCents)).toEqual([10000, 25000, 30000]);
    // Rever a repartição para a nova base e depois gravar.
    await s.replace.execute({ organizationId: ORG, id: inv.id, allocations: split(), reason: "Correção" });
  });

  test("feeds de análise: linhas só de «Por artigo»; repartições só de «Por valores» (sem dupla contagem)", async () => {
    const s = setup();
    const a = draft();
    const b = Invoice.createFromImport({ ...{ supplierName: "EDP", supplierNifSnapshot: "503504564", invoiceNumber: "FT 2", invoiceDate: new Date("2026-10-01"), dueDate: null, subtotalWithoutVat: 10000, totalVat: 2300, totalWithVat: 12300, source: "pdf_import", attachmentUrl: null, aiConfidence: 0.9, requiresReview: false } });
    await s.invoiceRepo.save(ORG, a);
    await s.invoiceRepo.save(ORG, b);
    await s.confirm.execute({ organizationId: ORG, id: a.id, financialMode: "by_values", lines: realLines, allocations: split() });
    await s.confirm.execute({ organizationId: ORG, id: b.id, financialMode: "by_item", lines: [line("Energia", 10000)] });
    const linesFeed = await new ListInvoiceLinesUseCase(s.lineRepo, s.invoiceRepo).execute(ORG);
    expect(linesFeed.map((l) => l.invoiceId)).toEqual([b.id]);
    const allocFeed = await new ListInvoiceAllocationsUseCase(s.allocationRepo, s.invoiceRepo).execute(ORG);
    expect(new Set(allocFeed.map((x) => x.invoiceId))).toEqual(new Set([a.id]));
  });
});
