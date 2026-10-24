import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ReadPaymentDocumentUseCase } from "../../application/use-cases/read-payment-document.use-case.js";
import type { PdfContent } from "../../domain/entities/invoice-reading.js";
import type { BarcodeState } from "../../domain/entities/payment-document.js";
import type { PdfContentReaderPort } from "../../domain/ports/out/pdf-content-reader.port.js";
import type { ObligationCandidatesPort } from "../../domain/ports/out/obligation-candidates.port.js";
import type { SupplierLookupPort, SupplierSummary } from "../../domain/ports/out/supplier-lookup.port.js";
import { AT_BARCODE, syntheticAt, syntheticSs } from "../domain/reading/synthetic-payment-docs.js";
import { syntheticMakro } from "../domain/reading/synthetic-makro.js";

const ORG = mintOrganizationId("org-a");

class FakePdf implements PdfContentReaderPort {
  barcodeCalls = 0;
  constructor(private readonly content: PdfContent | null | "throw", private readonly barcode: BarcodeState = { status: "decoded", symbology: "CODE128", payload: AT_BARCODE, page: 1 }) {}
  async read() {
    if (this.content === "throw") throw new Error("pdf inválido");
    return this.content;
  }
  async extractLogo() {
    return null;
  }
  async readBarcode() {
    this.barcodeCalls++;
    return this.barcode;
  }
}
const candidates = (): ObligationCandidatesPort & { orgs: string[] } => ({
  orgs: [],
  async find(org) {
    this.orgs.push(org);
    return [{ source: "invoice", id: "inv-1", invoiceId: "inv-1", label: "Fatura 12345678901", supplierName: "DGTF", amountCents: 25000, dueDate: "2026-11-20", documentDate: null, status: "paid" }];
  },
});
const supplier = (name: string): SupplierSummary => ({ id: `s-${name}`, name, nif: null, defaultCostCenterGroupId: "g", defaultCostCenterCategoryId: "c", defaultFinancialType: null });
const suppliers: SupplierLookupPort = {
  findAll: async () => [supplier("Makro"), supplier("DIRECCÃO-GERAL DO TESOURO E FINANÇAS"), supplier("Segurança Social")],
  findByNif: async () => null,
  findByName: async () => [],
} as unknown as SupplierLookupPort;
const make = (pdf: FakePdf, cands = candidates()) =>
  new ReadPaymentDocumentUseCase(pdf, cands, suppliers, { getNif: async () => "999999990" }, () => "2026-11-10");
const file = { buffer: Buffer.from("x"), mimeType: "application/pdf" };

describe("ReadPaymentDocumentUseCase", () => {
  test("AT: lê, procura duplicados na própria organização, sugere fornecedor; 0 IA; nada gravado", async () => {
    const pdf = new FakePdf(syntheticAt());
    const cands = candidates();
    const r = await make(pdf, cands).execute(ORG, file);
    expect(r).toMatchObject({ kind: "payment_document", payment: { kind: "at_withholding", totalCents: 25000 }, supplierSuggestion: { name: "DIRECCÃO-GERAL DO TESOURO E FINANÇAS", defaultCostCenterCategoryId: "c" }, metrics: { aiCalls: 0 } });
    expect(r!.matches[0]).toMatchObject({ strength: "strong", existing: { id: "inv-1" } });
    expect(cands.orgs).toEqual([ORG]);
    expect(pdf.barcodeCalls).toBe(1);
  });

  test("SS: não rasteriza (não tem código) e sugere o fornecedor Segurança Social", async () => {
    const pdf = new FakePdf(syntheticSs());
    const r = await make(pdf).execute(ORG, file);
    expect(r).toMatchObject({ payment: { kind: "ss_payment_reference", barcode: { status: "absent" } }, supplierSuggestion: { name: "Segurança Social" } });
    expect(pdf.barcodeCalls).toBe(0);
  });

  test("fatura comercial, PDF ilegível ou falha → null (segue o fluxo de faturas sem alterações)", async () => {
    expect(await make(new FakePdf(syntheticMakro())).execute(ORG, file)).toBeNull();
    expect(await make(new FakePdf(null)).execute(ORG, file)).toBeNull();
    expect(await make(new FakePdf("throw")).execute(ORG, file)).toBeNull();
  });
});
