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
import { GenericQrLayout } from "../../domain/services/reading/generic-qr-layout.js";
import { syntheticDreamPlus } from "../domain/reading/synthetic-dream-plus.js";

const ORG = mintOrganizationId("org-test");

/**
 * Critério de aceitação P0 da task «embalagens/conversões»: a fatura Dream Plus FT 56892 (réplica
 * sintética do formato) fecha em 206,87 € com diferença 0,00 €; tomate = 4 sacos (não 4000);
 * mozzarella = 20 kg; descontos e IVA por taxa corretos; Qt/Cx não multiplica nada; sem IA.
 */
describe("Dream Plus FT 56892 — leitura, linhas gravadas e motor de valores", () => {
  test("lê sem IA, grava 5 / 20 / 4 com os descontos, e o motor fecha 189,00 + 17,87 = 206,87 € (diferença 0)", async () => {
    const invoiceRepo = new FakeInvoiceRepository();
    const lineRepo = new FakeInvoiceLineRepository();
    const amounts = new FakeInvoiceAmountsWrite();
    let aiCalls = 0;
    const ai = new FakeAiExtractionPort();
    const importInvoice = new ImportInvoiceUseCase(invoiceRepo, new FakeDocumentStoragePort(), { extract: (b, m) => (aiCalls++, ai.extract(b, m)) }, new FakeSupplierLookupPort(), new FakeSupplierHintPort(), new FakeOrganizationIdentityRead(), new FakeFiscalIdentityPort(), {
      pdf: { read: async () => syntheticDreamPlus(), readBarcode: async () => ({ status: "absent" }), extractLogo: async () => null },
      layouts: [new MakroLayout(), new GenericQrLayout()],
      readingWrite: { save: async () => {} },
      classifyLines: null,
    });
    const save = new SaveInvoiceDraftUseCase(invoiceRepo, lineRepo, amounts, new FakeCostCenterCategoryReader(), new FakeInvoiceAllocationRepository(), new FakeInvoiceAudit());
    const r = await new ImportInvoiceKeepingLinesUseCase(importInvoice, save, invoiceRepo).execute({ organizationId: ORG, fileBuffer: Buffer.from("dream"), filename: "ft56892.pdf", mimeType: "application/pdf" });

    expect(aiCalls).toBe(0);
    expect(r.reading).toMatchObject({ source: "deterministic", status: "ready" });
    expect(r.extractedLines.map((l) => [l.quantity, l.quantityText])).toEqual([[5, "5,000"], [20, "20,000"], [4, "4,000"]]);

    const lines = await lineRepo.findByInvoiceId(ORG, r.invoice.id);
    expect(lines.map((l) => [l.description, l.quantity, l.unitCostWithoutVat, l.totalWithVat - l.vatAmount, l.vatRate])).toEqual([
      ["Q. Cheddar Ralado kg", 5, 820, 3895, 6],
      ["Q. Mozzarella ralado 100% Eurial kg", 20, 620, 11160, 6],
      ["Tomate Mutti p/ Pizza Classico 5 kg bolsa", 4, 1068, 3845, 23],
    ]);
    expect(r.invoice).toMatchObject({ subtotalWithoutVat: 18900, totalVat: 1787, totalWithVat: 20687 });
    const record = amounts.saved.get(r.invoice.id)!;
    expect(record.differenceCents).toBe(0);
    expect(record.discountCents).toBe(1872);
    expect(record.vatSummary).toEqual(expect.arrayContaining([expect.objectContaining({ rate: "6", baseCents: 15055, vatCents: 903 }), expect.objectContaining({ rate: "23", baseCents: 3845, vatCents: 884 })]));
  });
});
