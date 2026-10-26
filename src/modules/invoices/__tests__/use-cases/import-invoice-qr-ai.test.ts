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

function setup(suppliersSeed: SupplierSummary[], hintTo: string | null, pdfContent: PdfContent = content) {
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
  };
  const useCase = new ImportInvoiceUseCase(new FakeInvoiceRepository(), new FakeDocumentStoragePort(), ai, lookup, hints, identity, new FakeFiscalIdentityPort(), smart);
  return () => useCase.execute({ organizationId: ORG, fileBuffer: Buffer.from("pdf"), filename: "aguas.pdf", mimeType: "application/pdf" });
}

describe("ImportInvoiceUseCase — fatura com QR lida pela IA (documento de pagamento das águas)", () => {
  test("identidade e totais do QR; linhas que não fecham dão lugar às bases do QR; aviso das 2 faturas", async () => {
    const r = await setup([], null)();
    expect(r.invoice).toMatchObject({ invoiceNumber: "900001", subtotalWithoutVat: 5659, totalVat: 339, totalWithVat: 5998, supplierId: null });
    expect(r.extractedLines).toHaveLength(1);
    expect(r.extractedLines[0]).toMatchObject({ description: "Valor à taxa de IVA 6 % (QR fiscal)", vatRate: 6, totalWithoutVat: 5659 });
    const codes = r.reading?.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["lines_replaced_by_qr", "qr_multiple_documents"]));
  });

  test("documento com 2 QR: 2 rascunhos (um por QR) no mesmo grupo de pagamento, uma só chamada à IA", async () => {
    const run = setup([supplier("sup-residuos", "Resíduos Exemplo", "599999994")], null);
    const r = await run();
    expect(r.siblings).toHaveLength(1);
    const waste = r.siblings![0]!;
    expect(waste.invoice).toMatchObject({ invoiceNumber: "900002", supplierId: "sup-residuos", totalWithVat: 3005, totalVat: 0, subtotalWithoutVat: 3005 });
    expect(waste.extractedLines).toEqual([expect.objectContaining({ description: "Valor não sujeito a IVA (QR fiscal)", totalWithoutVat: 3005 })]);
    expect(waste.reading).toMatchObject({ source: "deterministic", aiCalls: 0, qrRead: true });
    expect(waste.reading?.issues.map((i) => i.code)).toEqual(["read_from_qr"]);
    // O prazo do débito é o mesmo documento de pagamento.
    expect(waste.invoice.dueDate).toBe(r.invoice.dueDate);
    expect(r.invoice.paymentGroupId).toBeTruthy();
    expect(waste.invoice.paymentGroupId).toBe(r.invoice.paymentGroupId);
    expect(r.invoice.id).not.toBe(waste.invoice.id);
  });

  test("um só QR: um rascunho, sem grupo de pagamento", async () => {
    const one = { ...content, qrCodes: [content.qrCodes[0]!] };
    const r = await setup([], null, one)();
    expect(r.siblings).toBeUndefined();
    expect(r.invoice.paymentGroupId).toBeNull();
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
});
