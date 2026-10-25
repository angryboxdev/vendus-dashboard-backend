import { ImportInvoiceUseCase } from "../../application/use-cases/import-invoice.use-case.js";
import { ImportInvoiceKeepingLinesUseCase } from "../../application/use-cases/import-invoice-keeping-lines.use-case.js";
import { SaveInvoiceDraftUseCase } from "../../application/use-cases/save-invoice-draft.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakeDocumentStoragePort } from "../fakes/fake-document-storage.port.js";
import { FakeAiExtractionPort } from "../fakes/fake-ai-extraction.port.js";
import { FakeSupplierLookupPort } from "../fakes/fake-supplier-lookup.port.js";
import { FakeSupplierHintPort } from "../fakes/fake-supplier-hint.port.js";
import { FakeOrganizationIdentityRead } from "../fakes/fake-organization-identity-read.port.js";
import { FakeFiscalIdentityPort } from "../fakes/fake-fiscal-identity.port.js";
import { FakeInvoiceAmountsWrite } from "../fakes/fake-invoice-amounts-write.js";
import { FakeCostCenterCategoryReader } from "../fakes/fake-cost-center-category-reader.js";
import { FakeInvoiceAllocationRepository } from "../fakes/fake-invoice-allocation-repository.js";
import { FakeInvoiceAudit } from "../fakes/fake-invoice-audit.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { MakroLayout } from "../../domain/services/reading/makro-layout.js";
import { syntheticMakro } from "../domain/reading/synthetic-makro.js";

const ORG = mintOrganizationId("org-test");

function setup(saveFails = false) {
  const invoiceRepo = new FakeInvoiceRepository();
  const lineRepo = new FakeInvoiceLineRepository();
  const importInvoice = new ImportInvoiceUseCase(invoiceRepo, new FakeDocumentStoragePort(), new FakeAiExtractionPort(), new FakeSupplierLookupPort(), new FakeSupplierHintPort(), new FakeOrganizationIdentityRead(), new FakeFiscalIdentityPort(), {
    pdf: { read: async () => syntheticMakro(), readBarcode: async () => ({ status: "absent" }), extractLogo: async () => null },
    layouts: [new MakroLayout()],
    readingWrite: { save: async () => {} },
    classifyLines: null,
  });
  const realSave = new SaveInvoiceDraftUseCase(invoiceRepo, lineRepo, new FakeInvoiceAmountsWrite(), new FakeCostCenterCategoryReader(), new FakeInvoiceAllocationRepository(), new FakeInvoiceAudit());
  const save = { execute: saveFails ? async () => { throw new Error("BD indisponível"); } : realSave.execute.bind(realSave) };
  const uc = new ImportInvoiceKeepingLinesUseCase(importInvoice, save, invoiceRepo);
  const run = () => uc.execute({ organizationId: ORG, fileBuffer: Buffer.from("pdf"), filename: "makro.pdf", mimeType: "application/pdf", actor: "fin@teste.pt" });
  return { run, invoiceRepo, lineRepo };
}

describe("ImportInvoiceKeepingLinesUseCase (E4)", () => {
  test("as linhas lidas ficam gravadas no rascunho e a resposta traz a versão atual (para confirmar sem conflito)", async () => {
    const s = setup();
    const r = await s.run();
    expect(r.extractedLines).toHaveLength(5);
    expect(await s.lineRepo.findByInvoiceId(ORG, r.invoice.id)).toHaveLength(5);
    const stored = await s.invoiceRepo.findById(ORG, r.invoice.id);
    expect(r.invoice.version).toBe(stored!.version);
    expect(r.invoice.lineDetailMode).toBe("detailed");
  });

  test("se gravar as linhas falhar, a importação continua como a normal", async () => {
    const s = setup(true);
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const r = await s.run();
    spy.mockRestore();
    expect(r.extractedLines).toHaveLength(5);
    expect(await s.lineRepo.findByInvoiceId(ORG, r.invoice.id)).toHaveLength(0);
  });
});
