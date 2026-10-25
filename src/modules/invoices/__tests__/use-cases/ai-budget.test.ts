import { ImportInvoiceUseCase } from "../../application/use-cases/import-invoice.use-case.js";
import { ClassifyInvoiceLinesUseCase } from "../../application/use-cases/classify-invoice-lines.use-case.js";
import { AiBudgetExceededError } from "../../domain/errors.js";
import type { AiBudgetPort, AiFeature } from "../../domain/ports/out/ai-budget.port.js";
import type { PdfContent } from "../../domain/entities/invoice-reading.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeDocumentStoragePort } from "../fakes/fake-document-storage.port.js";
import { FakeAiExtractionPort } from "../fakes/fake-ai-extraction.port.js";
import { FakeSupplierLookupPort } from "../fakes/fake-supplier-lookup.port.js";
import { FakeSupplierHintPort } from "../fakes/fake-supplier-hint.port.js";
import { FakeOrganizationIdentityRead } from "../fakes/fake-organization-identity-read.port.js";
import { FakeFiscalIdentityPort } from "../fakes/fake-fiscal-identity.port.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { MakroLayout } from "../../domain/services/reading/makro-layout.js";
import { syntheticMakro } from "../domain/reading/synthetic-makro.js";

const ORG = mintOrganizationId("org-test");

class FakeBudget implements AiBudgetPort {
  calls: AiFeature[] = [];
  constructor(private readonly remaining: number) {}
  async consume(_o: unknown, feature: AiFeature) {
    this.calls.push(feature);
    const allowed = this.calls.length <= this.remaining;
    return { allowed, used: this.calls.length, limit: this.remaining };
  }
}

function importer(content: PdfContent | null, budget: AiBudgetPort) {
  const storage = new FakeDocumentStoragePort();
  const ai = new FakeAiExtractionPort();
  let aiCalls = 0;
  const countingAi = { extract: (b: Buffer, m: string) => (aiCalls++, ai.extract(b, m)) };
  const uc = new ImportInvoiceUseCase(new FakeInvoiceRepository(), storage, countingAi, new FakeSupplierLookupPort(), new FakeSupplierHintPort(), new FakeOrganizationIdentityRead(), new FakeFiscalIdentityPort(), {
    pdf: { read: async () => content, readBarcode: async () => ({ status: "absent" }), extractLogo: async () => null },
    layouts: [new MakroLayout()],
    readingWrite: { save: async () => {} },
    classifyLines: null,
    aiBudget: budget,
  });
  return { run: () => uc.execute({ organizationId: ORG, fileBuffer: Buffer.from(String(Math.random())), filename: "f.pdf", mimeType: "application/pdf" }), storage, aiCalls: () => aiCalls };
}

describe("Orçamento diário de IA", () => {
  test("fatura lida pelo QR não gasta orçamento, mesmo esgotado", async () => {
    const budget = new FakeBudget(0);
    const s = importer(syntheticMakro(), budget);
    await expect(s.run()).resolves.toMatchObject({ reading: { source: "deterministic" } });
    expect(budget.calls).toEqual([]);
  });

  test("sem QR: conta uma chamada; esgotado → 429 antes de guardar o ficheiro e sem chamar a IA", async () => {
    const budget = new FakeBudget(1);
    const s = importer(null, budget);
    await s.run();
    expect(s.aiCalls()).toBe(1);
    await expect(s.run()).rejects.toBeInstanceOf(AiBudgetExceededError);
    expect(s.aiCalls()).toBe(1);
    expect(s.storage.storedFiles).toHaveLength(1);
    expect(budget.calls).toEqual(["invoice_extraction", "invoice_extraction"]);
  });

  test("categorias por linha: orçamento esgotado → só regras/histórico, sem IA", async () => {
    let aiCalls = 0;
    const uc = new ClassifyInvoiceLinesUseCase(
      { list: async () => [{ id: "c1", code: "EST.01", name: "Ingredientes", groupName: "Estoque", isActive: true }] } as never,
      { forSupplier: async () => [] } as never,
      { suggest: async () => (aiCalls++, []) },
      new FakeBudget(0),
    );
    await uc.execute(ORG, { supplierId: null, lines: [{ index: 0, kind: "product", supplierCode: null, description: "Coisa estranha" }] });
    expect(aiCalls).toBe(0);
  });
});
