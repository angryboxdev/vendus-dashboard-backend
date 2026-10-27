import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ImportInvoiceFromEmailUseCase } from "../../application/use-cases/import-invoice-from-email.use-case.js";
import { AiBudgetExceededError, InvoiceAlreadyInStockReviewError, NotAFiscalInvoiceError } from "../../domain/errors.js";
import type { ImportInvoicePort, ImportInvoiceForStockPort, InvoiceImportResultDTO } from "../../domain/ports/in/invoice.ports.js";
import type { ReadPaymentDocumentPort } from "../../domain/ports/in/payment-document.ports.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";

// Dados fictícios.
const ORG = mintOrganizationId("org-test");
const PDF = Buffer.from("%PDF-1.7 ficticio");

const result = (id: string, over: Partial<InvoiceImportResultDTO> = {}) =>
  ({ invoice: { id, status: "draft_ai" }, aiConfidence: 0.9, validationIssues: [], supplierMatch: null, extractedLines: [], ...over }) as unknown as InvoiceImportResultDTO;

function build(opts: { importResult?: InvoiceImportResultDTO | Error; payment?: unknown; stock?: ImportInvoiceForStockPort } = {}) {
  const repo = new FakeInvoiceRepository();
  const calls: unknown[] = [];
  const importer: ImportInvoicePort = {
    execute: async (c) => {
      calls.push(c);
      if (opts.importResult instanceof Error) throw opts.importResult;
      return opts.importResult ?? result("inv-1");
    },
  };
  const reader: ReadPaymentDocumentPort = { execute: async () => (opts.payment ?? null) as never };
  return { repo, calls, useCase: new ImportInvoiceFromEmailUseCase(importer, repo, reader, opts.stock) };
}

describe("Importar uma fatura recebida por email", () => {
  it("rascunho «Por rever» pelo mesmo import (ator «email») e marcado com origem Email", async () => {
    const { repo, calls, useCase } = build();
    const r = await useCase.execute({ organizationId: ORG, destination: "finance", fileBuffer: PDF, filename: "FT 1.pdf" });
    expect(r).toEqual({ outcome: "imported", invoiceIds: ["inv-1"] });
    expect(calls[0]).toMatchObject({ organizationId: ORG, filename: "FT 1.pdf", mimeType: "application/pdf", actor: "email" });
    expect(repo.intakeSources.get("inv-1")).toBe("email");
  });

  it("documento de pagamento com várias faturas → todas marcadas", async () => {
    const { repo, useCase } = build({ importResult: result("inv-1", { siblings: [result("inv-2"), result("inv-old", { reused: "same_file" })] }) });
    const r = await useCase.execute({ organizationId: ORG, destination: "finance", fileBuffer: PDF, filename: "agua.pdf" });
    expect(r).toEqual({ outcome: "imported", invoiceIds: ["inv-1", "inv-2"] });
    expect([...repo.intakeSources.keys()]).toEqual(["inv-1", "inv-2"]);
  });

  it("4. mesma fatura já importada (mesmo ficheiro ou mesma identidade fiscal) → duplicado, sem marcar", async () => {
    const { repo, useCase } = build({ importResult: result("inv-manual", { reused: "same_fiscal_identity" }) });
    const r = await useCase.execute({ organizationId: ORG, destination: "finance", fileBuffer: PDF, filename: "FT 1.pdf" });
    expect(r).toMatchObject({ outcome: "duplicate", invoiceId: "inv-manual" });
    expect(repo.intakeSources.size).toBe(0);
  });

  it("documento de cobrança AT/SS → rejeitado (como no ecrã, não vira fatura)", async () => {
    const { calls, useCase } = build({ payment: { kind: "tax_obligation" } });
    const r = await useCase.execute({ organizationId: ORG, destination: "finance", fileBuffer: PDF, filename: "IUC.pdf" });
    expect(r).toMatchObject({ outcome: "rejected", code: "payment_document" });
    expect(calls).toHaveLength(0);
  });

  it("11. não é fatura → rejeitado; orçamento da IA esgotado → tentar mais tarde; outro erro sobe", async () => {
    expect(await build({ importResult: new NotAFiscalInvoiceError("GR") }).useCase.execute({ organizationId: ORG, destination: "finance", fileBuffer: PDF, filename: "x.pdf" })).toMatchObject({ outcome: "rejected", code: "not_invoice" });
    expect(await build({ importResult: new AiBudgetExceededError(100) }).useCase.execute({ organizationId: ORG, destination: "finance", fileBuffer: PDF, filename: "x.pdf" })).toMatchObject({ outcome: "retry_later" });
    await expect(build({ importResult: new Error("falha de armazenamento") }).useCase.execute({ organizationId: ORG, destination: "finance", fileBuffer: PDF, filename: "x.pdf" })).rejects.toThrow("falha de armazenamento");
  });

  it("destino Stock → import do Stock (Compras por rever); já em Compras por rever → duplicado", async () => {
    const stockCalls: unknown[] = [];
    const stock: ImportInvoiceForStockPort = {
      execute: async (c) => {
        stockCalls.push(c);
        return { kind: "created", invoiceId: "inv-s", reviewId: "rev-1", validationIssues: [], reading: null };
      },
    };
    const { repo, useCase } = build({ stock });
    expect(await useCase.execute({ organizationId: ORG, destination: "stock", fileBuffer: PDF, filename: "FT 2.pdf" })).toEqual({ outcome: "imported", invoiceIds: ["inv-s"] });
    expect(stockCalls[0]).toMatchObject({ actor: "email" });
    expect(repo.intakeSources.get("inv-s")).toBe("email");

    const dup = build({ stock: { execute: async () => { throw new InvoiceAlreadyInStockReviewError("rev-1", "Já está em Compras por rever."); } } });
    expect(await dup.useCase.execute({ organizationId: ORG, destination: "stock", fileBuffer: PDF, filename: "FT 2.pdf" })).toMatchObject({ outcome: "duplicate" });
  });

  it("13. receber nunca confirma, paga nem mexe no stock: só cria o rascunho pelo import", async () => {
    const { repo, useCase } = build();
    await useCase.execute({ organizationId: ORG, destination: "finance", fileBuffer: PDF, filename: "FT 1.pdf" });
    // O caso de uso só tem acesso ao import (rascunho) e à marca de origem — nenhuma porta de confirmar/pagar/stock.
    expect(await repo.findById(ORG, "inv-1")).toBeNull();
  });
});
