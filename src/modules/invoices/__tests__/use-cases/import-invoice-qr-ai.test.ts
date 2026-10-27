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
import { normalizeSupplierName } from "../../domain/utils/supplier-name.js";
import type { PdfContent } from "../../domain/entities/invoice-reading.js";
import type { SupplierSummary } from "../../domain/ports/out/supplier-lookup.port.js";

const ORG = mintOrganizationId("org-test");
const OWN_NIF = "999999990"; // fictício: a própria empresa (cliente das faturas)

// Documento de pagamento fictício de um serviço de águas: duas faturas fiscais (QR em vetor, lidos por rasterização).
const QR_WATER = `A:599999993*B:${OWN_NIF}*C:PT*D:FT*E:N*F:20261019*G:900001*H:ABCD1234-900001*I1:PT*I3:56.59*I4:3.39*N:3.39*O:59.98*Q:ab12*R:999`;
const QR_WASTE = `A:599999994*B:${OWN_NIF}*C:PT*D:FT*E:N*F:20261019*G:900002*H:WXYZ5678-900002*I1:PT*L:30.05*N:0.00*O:30.05*Q:cd34*R:999`;
const content: PdfContent = { pages: [], qrCodes: [{ page: 2, text: QR_WATER }, { page: 2, text: QR_WASTE }] };

const supplier = (id: string, name: string, nif: string | null): SupplierSummary => ({
  id, name, nif, defaultCostCenterGroupId: null, defaultCostCenterCategoryId: null, defaultFinancialType: null,
});

function setup(
  suppliersSeed: SupplierSummary[],
  hintTo: string | null,
  pdfContent: PdfContent = content,
  recurrenceHint: { categoryId: string; recurrenceName: string } | null = null,
) {
  const ai = new FakeAiExtractionPort();
  // O que a IA leu (errado): NIF inventado, número do documento de pagamento, linhas que não fecham.
  ai.setResult({
    supplierName: "Águas Exemplo do Porto",
    supplierNif: "508000000",
    invoiceNumber: "261000000000001",
    issueDate: new Date("2026-10-19"),
    dueDate: new Date("2026-11-03"),
    subtotalWithoutVat: 5698,
    vatAmount: 300,
    totalWithVat: 5998,
    confidence: 0.95,
    lines: [
      { description: "ÁGUA", quantity: 13000, unitPriceWithoutVat: null, vatRate: 6, vatAmount: 180, totalWithoutVat: 3008, totalWithVat: 3188 },
      { description: "ÁGUAS RESIDUAIS", quantity: 13000, unitPriceWithoutVat: null, vatRate: 6, vatAmount: 155, totalWithoutVat: 2584, totalWithVat: 2739 },
      { description: "TAXA DE RECURSOS HÍDRICOS", quantity: 13300, unitPriceWithoutVat: null, vatRate: 6, vatAmount: 8, totalWithoutVat: 125, totalWithVat: 133 },
      { description: "IVA", quantity: 1, unitPriceWithoutVat: 0, vatRate: 6, vatAmount: 0, totalWithoutVat: 0, totalWithVat: 0 },
    ],
  });
  const lookup = new FakeSupplierLookupPort();
  lookup.seed(suppliersSeed);
  const hints = new FakeSupplierHintPort();
  hints.seedSuppliers(suppliersSeed);
  if (hintTo) hints.seedHint(normalizeSupplierName("Águas Exemplo do Porto")!, hintTo);
  const identity = new FakeOrganizationIdentityRead();
  identity.seedNif(OWN_NIF);
  const smart: SmartReadingDeps = {
    pdf: { read: async () => pdfContent, readBarcode: async () => ({ status: "absent" }), extractLogo: async () => null },
    layouts: [new MakroLayout()],
    readingWrite: { save: async () => undefined },
    classifyLines: null,
    recurrenceCategoryHint: { forSupplier: async () => recurrenceHint },
  };
  const useCase = new ImportInvoiceUseCase(new FakeInvoiceRepository(), new FakeDocumentStoragePort(), ai, lookup, hints, identity, new FakeFiscalIdentityPort(), smart);
  return () => useCase.execute({ organizationId: ORG, fileBuffer: Buffer.from("pdf"), filename: "aguas.pdf", mimeType: "application/pdf" });
}

function setupWithHint(suppliersSeed: SupplierSummary[], forSupplier: (o: unknown, id: string) => Promise<{ categoryId: string; recurrenceName: string } | null>) {
  const ai = new FakeAiExtractionPort();
  ai.setResult({ supplierName: "Águas Exemplo do Porto", supplierNif: "508000000", totalWithVat: 5998, confidence: 0.95, lines: [] });
  const lookup = new FakeSupplierLookupPort();
  lookup.seed(suppliersSeed);
  const identity = new FakeOrganizationIdentityRead();
  identity.seedNif(OWN_NIF);
  const smart: SmartReadingDeps = {
    pdf: { read: async () => content, readBarcode: async () => ({ status: "absent" }), extractLogo: async () => null },
    layouts: [new MakroLayout()],
    readingWrite: { save: async () => undefined },
    classifyLines: null,
    recurrenceCategoryHint: { forSupplier: forSupplier as never },
  };
  const useCase = new ImportInvoiceUseCase(new FakeInvoiceRepository(), new FakeDocumentStoragePort(), ai, lookup, new FakeSupplierHintPort(), identity, new FakeFiscalIdentityPort(), smart);
  return () => useCase.execute({ organizationId: ORG, fileBuffer: Buffer.from("pdf"), filename: "aguas.pdf", mimeType: "application/pdf" });
}

function setupClassified(suppliersSeed: SupplierSummary[], classifyLines: SmartReadingDeps["classifyLines"], hint: { categoryId: string; recurrenceName: string } | null) {
  const ai = new FakeAiExtractionPort();
  // Linhas que fecham com o QR (ficam as da IA, com descrição real).
  ai.setResult({ supplierName: "Águas Exemplo", supplierNif: "599999993", totalWithVat: 5998, confidence: 0.95, lines: [
    { description: "Consumo de água", quantity: 1, unitPriceWithoutVat: 5000, vatRate: 6, vatAmount: null, totalWithoutVat: 5000, totalWithVat: null },
    { description: "Saneamento", quantity: 1, unitPriceWithoutVat: 659, vatRate: 6, vatAmount: null, totalWithoutVat: 659, totalWithVat: null },
  ] });
  const lookup = new FakeSupplierLookupPort();
  lookup.seed(suppliersSeed);
  const identity = new FakeOrganizationIdentityRead();
  identity.seedNif(OWN_NIF);
  const smart: SmartReadingDeps = {
    pdf: { read: async () => ({ ...content, qrCodes: [content.qrCodes[0]!] }), readBarcode: async () => ({ status: "absent" }), extractLogo: async () => null },
    layouts: [new MakroLayout()],
    readingWrite: { save: async () => undefined },
    classifyLines,
    recurrenceCategoryHint: { forSupplier: async () => hint },
  };
  const useCase = new ImportInvoiceUseCase(new FakeInvoiceRepository(), new FakeDocumentStoragePort(), ai, lookup, new FakeSupplierHintPort(), identity, new FakeFiscalIdentityPort(), smart);
  return () => useCase.execute({ organizationId: ORG, fileBuffer: Buffer.from("pdf"), filename: "aguas.pdf", mimeType: "application/pdf" });
}

describe("ImportInvoiceUseCase — fatura com QR lida pela IA (documento de pagamento das águas)", () => {
  test("documento com 2 QR: uma só fatura com a identidade do 1.º e a soma dos dois (90,03 €), uma linha por taxa", async () => {
    const r = await setup([], null)();
    expect(r.siblings).toBeUndefined();
    expect(r.invoice).toMatchObject({ invoiceNumber: "900001", subtotalWithoutVat: 8664, totalVat: 339, totalWithVat: 9003, supplierId: null });
    expect(r.extractedLines.map((l) => [l.description, l.vatRate, l.totalWithoutVat])).toEqual([
      ["Valor à taxa de IVA 6 % (QR fiscal)", 6, 5659],
      ["Valor não sujeito a IVA (QR fiscal)", 0, 3005],
    ]);
    expect(r.extractedAmounts?.vatSummary).toEqual([{ rate: 6, baseCents: 5659, vatCents: 339 }, { rate: 0, baseCents: 3005, vatCents: 0 }]);
    const codes = r.reading?.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["lines_replaced_by_qr", "qr_multiple_documents"]));
  });

  test("lançada na empresa das águas; a fatura dos resíduos fica nas notas (número, emitente, NIF, valor)", async () => {
    const r = await setup([supplier("sup-aguas", "Águas Exemplo", "599999993"), supplier("sup-residuos", "Resíduos Exemplo", "599999994")], null)();
    expect(r.invoice.supplierId).toBe("sup-aguas");
    expect(r.invoice.notes).toContain("Inclui a fatura 900002 de Resíduos Exemplo (NIF 599999994, 30,05 €)");
  });

  test("emitente dos resíduos sem ficha: as notas dizem «outro emitente» com o NIF", async () => {
    const r = await setup([supplier("sup-aguas", "Águas Exemplo", "599999993")], null)();
    expect(r.invoice.notes).toContain("900002 de outro emitente (NIF 599999994, 30,05 €)");
  });

  test("um só QR: um rascunho, sem grupo de pagamento", async () => {
    const one = { ...content, qrCodes: [content.qrCodes[0]!] };
    const r = await setup([], null, one)();
    expect(r.siblings).toBeUndefined();
    expect(r.invoice).toMatchObject({ totalWithVat: 5998, notes: null });
  });

  test("fornecedor certo pelo NIF do QR, mesmo com uma dica antiga para outro fornecedor", async () => {
    const run = setup([supplier("sup-aguas", "Águas Exemplo", "599999993"), supplier("sup-luz", "Energia Exemplo", "599999995")], "sup-luz");
    const r = await run();
    expect(r.invoice.supplierId).toBe("sup-aguas");
  });

  test("dica para um fornecedor com outro NIF é ignorada; ficha com o NIF da própria empresa gera aviso", async () => {
    const r = await setup([supplier("sup-errado", "Energia Exemplo", OWN_NIF)], "sup-errado")();
    expect(r.invoice.supplierId).toBeNull();
    expect(r.validationIssues).toEqual(expect.arrayContaining(["supplier_record_has_own_nif", "no_supplier_match"]));
  });

  test("dica para fornecedor sem NIF na ficha continua a valer (nada a contradizer)", async () => {
    const r = await setup([supplier("sup-sem-nif", "Águas Exemplo", null)], "sup-sem-nif")();
    expect(r.invoice.supplierId).toBe("sup-sem-nif");
  });

  test("linhas do QR: aviso de IVA arredondado linha a linha (56,59 × 6 % = 3,40 € ≠ 3,39 € do documento)", async () => {
    const r = await setup([], null)();
    const rounding = r.reading?.issues.find((i) => i.code === "vat_rounded_per_line");
    expect(rounding?.blocking).toBe(false);
    expect(rounding?.detail).toContain("-0,01 €");
    // A fatura dos resíduos (não sujeita a IVA) não precisa de ajuste.
  });

  test("linhas sem classificação: categoria por defeito do fornecedor", async () => {
    const withDefault = { ...supplier("sup-aguas", "Águas Exemplo", "599999993"), defaultCostCenterCategoryId: "c-agua" };
    const r = await setup([withDefault], null)();
    expect(r.extractedLines[0]).toMatchObject({ suggestedCostCenterCategoryId: "c-agua", classificationSource: "supplier_default" });
  });

  test("sem categoria no fornecedor: sub-categoria da recorrência desse fornecedor", async () => {
    const r = await setup([supplier("sup-aguas", "Águas Exemplo", "599999993")], null, content, { categoryId: "c-agua", recurrenceName: "Água" })();
    expect(r.extractedLines[0]).toMatchObject({ suggestedCostCenterCategoryId: "c-agua", classificationSource: "recurrence" });
    expect(r.extractedLines[0]!.classificationEvidence).toContain("«Água»");
  });

  test("sem fornecedor reconhecido não se inventa categoria", async () => {
    const r = await setup([], null, content, { categoryId: "c-agua", recurrenceName: "Água" })();
    expect(r.extractedLines[0]!.suggestedCostCenterCategoryId).toBeUndefined();
  });

  test("linhas de água e de resíduos ficam com a categoria da recorrência da empresa das águas", async () => {
    const hint = async (_o: unknown, id: string) => (id === "sup-aguas" ? { categoryId: "c-agua", recurrenceName: "Água" } : null);
    const r = await setupWithHint([supplier("sup-aguas", "Águas Exemplo", "599999993")], hint)();
    expect(r.extractedLines.map((l) => [l.suggestedCostCenterCategoryId, l.classificationSource])).toEqual([
      ["c-agua", "recurrence"],
      ["c-agua", "recurrence"],
    ]);
  });

  test("recorrência do fornecedor vale mais do que palavras-chave e IA, mas não do que o histórico", async () => {
    const classifyLines = {
      execute: async () => ({
        classifications: [
          { index: 0, categoryId: "c-bebidas", source: "keyword" as const, evidence: "«água» → Bebidas" },
          { index: 1, categoryId: "c-bebidas", source: "ai" as const, evidence: "IA" },
        ],
        metrics: { lines: 2, deterministic: 1, aiRequested: 1, aiResolved: 1, aiError: false },
      }),
    };
    const run = setupClassified([supplier("sup-aguas", "Águas Exemplo", "599999993")], classifyLines, { categoryId: "c-agua", recurrenceName: "Água" });
    const r = await run();
    expect(r.extractedLines.map((l) => [l.suggestedCostCenterCategoryId, l.classificationSource])).toEqual([
      ["c-agua", "recurrence"],
      ["c-agua", "recurrence"],
    ]);

    const fromHistory = { execute: async () => ({ classifications: [0, 1].map((index) => ({ index, categoryId: "c-escolhida", source: "history_description" as const, evidence: "h" })), metrics: { lines: 2, deterministic: 2, aiRequested: 0, aiResolved: 0, aiError: false } }) };
    const r2 = await setupClassified([supplier("sup-aguas", "Águas Exemplo", "599999993")], fromHistory, { categoryId: "c-agua", recurrenceName: "Água" })();
    expect(r2.extractedLines.map((l) => l.classificationSource)).toEqual(["history_description", "history_description"]);
  });

  test("categoria por defeito do fornecedor não se sobrepõe a palavras-chave (só preenche o que falta)", async () => {
    const classifyLines = { execute: async () => ({ classifications: [{ index: 0, categoryId: "c-bebidas", source: "keyword" as const, evidence: "k" }], metrics: { lines: 2, deterministic: 1, aiRequested: 0, aiResolved: 0, aiError: false } }) };
    const withDefault = { ...supplier("sup-aguas", "Águas Exemplo", "599999993"), defaultCostCenterCategoryId: "c-agua" };
    const r = await setupClassified([withDefault], classifyLines, null)();
    expect(r.extractedLines.map((l) => [l.suggestedCostCenterCategoryId, l.classificationSource])).toEqual([
      ["c-bebidas", "keyword"],
      ["c-agua", "supplier_default"],
    ]);
  });
});
