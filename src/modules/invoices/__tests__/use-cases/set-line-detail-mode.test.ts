import { SetLineDetailModeUseCase } from "../../application/use-cases/set-line-detail-mode.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakeInvoiceStockReviewStatusRead } from "../fakes/fake-invoice-stock-review-status-read.js";
import { FakeInvoiceStockReviewDraftDelete } from "../fakes/fake-invoice-stock-review-draft-delete.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import {
  InvoiceNotFoundError,
  InvoiceLinesLockedByAppliedStockReviewError,
  StockReviewRemovalConfirmationRequiredError,
} from "../../domain/errors.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_ID = mintOrganizationId("org-test");

const makeInvoice = () =>
  Invoice.create({
    supplierName: "Makro",
    invoiceNumber: "MKR-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 100000,
    totalVat: 23000,
    totalWithVat: 123000,
  });

const makeLine = (invoiceId: string, totalWithVat: number, vatAmount: number) =>
  InvoiceLine.create({
    invoiceId,
    description: "Linha teste",
    quantity: 1,
    unitCostWithoutVat: totalWithVat - vatAmount,
    vatRate: 23,
    vatAmount,
    totalWithVat,
  });

describe("SetLineDetailModeUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let stockReviewStatusRead: FakeInvoiceStockReviewStatusRead;
  let stockReviewDraftDelete: FakeInvoiceStockReviewDraftDelete;
  let useCase: SetLineDetailModeUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    stockReviewStatusRead = new FakeInvoiceStockReviewStatusRead();
    stockReviewDraftDelete = new FakeInvoiceStockReviewDraftDelete();
    useCase = new SetLineDetailModeUseCase(invoiceRepo, lineRepo, stockReviewStatusRead, stockReviewDraftDelete);
  });

  it("switches invoice from simple to detailed mode", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);

    const dto = await useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "detailed" });
    expect(dto.lineDetailMode).toBe("detailed");
  });

  it("switches detailed back to simple even when there are no lines", async () => {
    const inv = makeInvoice().setLineDetailMode("detailed");
    await invoiceRepo.save(ORG_ID, inv);

    const dto = await useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "simple" });
    expect(dto.lineDetailMode).toBe("simple");
  });

  it("deletes detailed lines when switching back to simple (lines do not match)", async () => {
    const inv = makeInvoice().setLineDetailMode("detailed");
    await invoiceRepo.save(ORG_ID, inv);
    await lineRepo.saveAll(ORG_ID, [makeLine(inv.id, 50000, 10000)]); // soma diferente do total da fatura

    const dto = await useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "simple" });
    expect(dto.lineDetailMode).toBe("simple");

    const remaining = await lineRepo.findByInvoiceId(ORG_ID, inv.id);
    expect(remaining).toHaveLength(0);
  });

  it("deletes detailed lines when switching back to simple (lines match)", async () => {
    const inv = makeInvoice().setLineDetailMode("detailed");
    await invoiceRepo.save(ORG_ID, inv);
    await lineRepo.saveAll(ORG_ID, [makeLine(inv.id, 123000, 23000)]);

    await useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "simple" });

    const remaining = await lineRepo.findByInvoiceId(ORG_ID, inv.id);
    expect(remaining).toHaveLength(0);
  });

  it("does not delete lines when switching from simple to detailed", async () => {
    // linhas de outra fatura não devem ser tocadas
    const inv = makeInvoice();
    const other = makeInvoice().setLineDetailMode("detailed");
    await invoiceRepo.save(ORG_ID, inv);
    await invoiceRepo.save(ORG_ID, other);
    await lineRepo.saveAll(ORG_ID, [makeLine(other.id, 123000, 23000)]);

    await useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "detailed" });

    const otherLines = await lineRepo.findByInvoiceId(ORG_ID, other.id);
    expect(otherLines).toHaveLength(1);
  });

  it("throws InvoiceNotFoundError when invoice does not exist", async () => {
    await expect(useCase.execute({ organizationId: ORG_ID, id: "nonexistent", mode: "detailed" })).rejects.toThrow(InvoiceNotFoundError);
  });

  // ── Guard: descartar linhas detalhadas contra uma revisão de stock associada ──

  describe("guarda contra revisão de stock ao voltar para simple", () => {
    it("não verifica a revisão quando não há linhas a descartar (simple → detailed)", async () => {
      const inv = makeInvoice();
      await invoiceRepo.save(ORG_ID, inv);
      stockReviewStatusRead.seed(inv.id, { reviewId: "rev-1", status: "applied" });

      await expect(useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "detailed" })).resolves.toBeDefined();
    });

    it("prossegue sem pedir nada quando não há revisão associada", async () => {
      const inv = makeInvoice().setLineDetailMode("detailed");
      await invoiceRepo.save(ORG_ID, inv);
      await lineRepo.saveAll(ORG_ID, [makeLine(inv.id, 123000, 23000)]);

      const dto = await useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "simple" });
      expect(dto.lineDetailMode).toBe("simple");
      expect(stockReviewDraftDelete.calls).toHaveLength(0);
    });

    it("lança StockReviewRemovalConfirmationRequiredError quando há revisão pendente e não há confirmação — linhas não são apagadas", async () => {
      const inv = makeInvoice().setLineDetailMode("detailed");
      await invoiceRepo.save(ORG_ID, inv);
      await lineRepo.saveAll(ORG_ID, [makeLine(inv.id, 123000, 23000)]);
      stockReviewStatusRead.seed(inv.id, { reviewId: "rev-1", status: "pending" });

      await expect(
        useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "simple" }),
      ).rejects.toThrow(StockReviewRemovalConfirmationRequiredError);

      const remaining = await lineRepo.findByInvoiceId(ORG_ID, inv.id);
      expect(remaining).toHaveLength(1);
    });

    it("com confirmação, apaga o rascunho e descarta as linhas", async () => {
      const inv = makeInvoice().setLineDetailMode("detailed");
      await invoiceRepo.save(ORG_ID, inv);
      await lineRepo.saveAll(ORG_ID, [makeLine(inv.id, 123000, 23000)]);
      stockReviewStatusRead.seed(inv.id, { reviewId: "rev-1", status: "ready" });

      const dto = await useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "simple", confirmRemoveStockReview: true });

      expect(dto.lineDetailMode).toBe("simple");
      expect(stockReviewDraftDelete.calls).toHaveLength(1);
      const remaining = await lineRepo.findByInvoiceId(ORG_ID, inv.id);
      expect(remaining).toHaveLength(0);
    });

    it("bloqueia sempre com InvoiceLinesLockedByAppliedStockReviewError quando a revisão já foi aplicada, mesmo com confirmação", async () => {
      const inv = makeInvoice().setLineDetailMode("detailed");
      await invoiceRepo.save(ORG_ID, inv);
      await lineRepo.saveAll(ORG_ID, [makeLine(inv.id, 123000, 23000)]);
      stockReviewStatusRead.seed(inv.id, { reviewId: "rev-1", status: "applied" });

      await expect(
        useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "simple", confirmRemoveStockReview: true }),
      ).rejects.toThrow(InvoiceLinesLockedByAppliedStockReviewError);

      const remaining = await lineRepo.findByInvoiceId(ORG_ID, inv.id);
      expect(remaining).toHaveLength(1);
    });
  });
});
