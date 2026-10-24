import { ImportInvoiceUseCase, type SmartReadingDeps } from "../../application/use-cases/import-invoice.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeDocumentStoragePort } from "../fakes/fake-document-storage.port.js";
import { FakeAiExtractionPort } from "../fakes/fake-ai-extraction.port.js";
import { FakeSupplierLookupPort } from "../fakes/fake-supplier-lookup.port.js";
import { FakeSupplierHintPort } from "../fakes/fake-supplier-hint.port.js";
import { FakeOrganizationIdentityRead } from "../fakes/fake-organization-identity-read.port.js";
import { FakeFiscalIdentityPort } from "../fakes/fake-fiscal-identity.port.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { MakroLayout } from "../../domain/services/reading/makro-layout.js";
import type { PdfContent } from "../../domain/entities/invoice-reading.js";
import type { ClassifyInvoiceLinesPort } from "../../domain/ports/in/classify-invoice-lines.port.js";
import { QR, syntheticMakro } from "../domain/reading/synthetic-makro.js";

const ORG = mintOrganizationId("org-test");

class CountingAi extends FakeAiExtractionPort {
  calls = 0;
  override async extract(b: Buffer, m: string) {
    this.calls++;
    return super.extract(b, m);
  }
}

function setup(content: PdfContent | null, classify: ClassifyInvoiceLinesPort | null = null) {
  const invoiceRepo = new FakeInvoiceRepository();
  const ai = new CountingAi();
  const fiscal = new FakeFiscalIdentityPort();
  const saved: { invoiceId: string; data: unknown }[] = [];
  const suppliers = new FakeSupplierLookupPort();
  suppliers.seed([{ id: "sup-makro", name: "Makro", nif: "502030712", defaultCostCenterGroupId: null, defaultCostCenterCategoryId: null, defaultFinancialType: null }]);
  const smart: SmartReadingDeps = {
    pdf: { read: async () => content, readBarcode: async () => ({ status: "absent" }) },
    layouts: [new MakroLayout()],
    readingWrite: { save: async (_o, invoiceId, data) => void saved.push({ invoiceId, data }) },
    classifyLines: classify,
  };
  const useCase = new ImportInvoiceUseCase(invoiceRepo, new FakeDocumentStoragePort(), ai, suppliers, new FakeSupplierHintPort(), new FakeOrganizationIdentityRead(), fiscal, smart);
  const run = () => useCase.execute({ organizationId: ORG, fileBuffer: Buffer.from("pdf"), filename: "makro.pdf", mimeType: "application/pdf" });
  return { run, ai, fiscal, saved };
}

describe("ImportInvoiceUseCase — leitor inteligente (E3)", () => {
  test("layout conhecido: lê sem IA, totais do QR, linhas com metadados, ATCUD para a identidade fiscal", async () => {
    const { run, ai, fiscal, saved } = setup(syntheticMakro());
    const r = await run();
    expect(ai.calls).toBe(0);
    expect(r.invoice).toMatchObject({ supplierId: "sup-makro", invoiceNumber: "FAC 0001/000001", totalWithVat: 8063, subtotalWithoutVat: 6747, totalVat: 1316 });
    expect(r.reading).toMatchObject({ source: "deterministic", layout: "layout:makro", qrRead: true, status: "ready", aiCalls: 0 });
    expect(r.extractedLines).toHaveLength(5);
    expect(r.extractedLines[0]).toMatchObject({ quantityText: "6", unitPriceText: "2,00", grossWithoutDiscount: 1200, discountAmount: 60, totalWithoutVat: 1140, vatRate: 23, meta: { supplierCode: "0001234567890", promoCode: "11111", kind: "product" } });
    expect(r.extractedLines[3]!.meta).toMatchObject({ kind: "deposit", relatedOrder: 2, vatCode: "0" });
    expect(r.extractedAmounts?.vatSummary).toEqual([{ rate: 23, baseCents: 5657, vatCents: 1301 }, { rate: 6, baseCents: 250, vatCents: 15 }, { rate: 0, baseCents: 840, vatCents: 0 }]);
    expect(fiscal.checks[0]).toMatchObject({ atcud: "ABCD1234-000001", invoiceNumber: "FAC 0001/000001" });
    expect(saved[0]).toMatchObject({ data: { source: "deterministic", fiscalQr: { A: "502030712", O: "80.63" } } });
  });

  test("categoria sugerida por linha (fornecedor reconhecido) com origem e evidência", async () => {
    const calls: unknown[] = [];
    const classify: ClassifyInvoiceLinesPort = {
      execute: async (_o, input) => {
        calls.push(input);
        return { classifications: input.lines.map((l) => ({ index: l.index, categoryId: l.kind === "deposit" ? "c-dep" : null, source: l.kind === "deposit" ? "line_kind" : "none", evidence: "e" })), metrics: { lines: 0, deterministic: 0, aiRequested: 0, aiResolved: 0, aiError: false } };
      },
    };
    const { run } = setup(syntheticMakro(), classify);
    const r = await run();
    expect(calls[0]).toMatchObject({ supplierId: "sup-makro" });
    expect(r.extractedLines[3]).toMatchObject({ suggestedCostCenterCategoryId: "c-dep", classificationSource: "line_kind" });
    expect(r.extractedLines[0]).toMatchObject({ suggestedCostCenterCategoryId: null, classificationSource: "none" });
  });

  test("falha da classificação nunca faz falhar a importação", async () => {
    const { run } = setup(syntheticMakro(), { execute: async () => { throw new Error("rede"); } });
    const r = await run();
    expect(r.extractedLines[0]!.suggestedCostCenterCategoryId).toBeUndefined();
    expect(r.invoice.totalWithVat).toBe(8063);
  });

  test("pró-forma (QR tipo PF) é recusada antes de guardar o ficheiro; nota de crédito (NC) é aceite", async () => {
    const pf = syntheticMakro({ qr: QR.replace("D:FT", "D:PF") });
    const s = setup(pf);
    await expect(s.run()).rejects.toThrow(/fatura pró-forma \(PF\).*não gera conta a pagar/);
    expect(s.ai.calls).toBe(0);
    const nc = setup(syntheticMakro({ qr: QR.replace("D:FT", "D:NC") }));
    const r = await nc.run();
    expect(r.invoice.documentType).toBe("credit_note");
  });

  test("layout desconhecido ou PDF sem texto → IA como hoje (uma chamada)", async () => {
    const unknown = syntheticMakro();
    unknown.pages = unknown.pages.map((p) => ({ ...p, words: p.words.filter((w) => !/MAKRO|PACK/.test(w.text)) }));
    unknown.qrCodes = [];
    for (const content of [unknown, null]) {
      const { run, ai, saved } = setup(content);
      const r = await run();
      expect(ai.calls).toBe(1);
      expect(r.reading).toMatchObject({ source: "ai", aiCalls: 1 });
      expect(saved).toEqual([]);
    }
  });
});
