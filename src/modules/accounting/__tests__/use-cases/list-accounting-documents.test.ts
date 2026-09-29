import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ListAccountingDocumentsUseCase } from "../../application/use-cases/list-accounting-documents.use-case.js";
import { AccountingDocument } from "../../domain/entities/accounting-document.js";
import { FakeListInvoices, invoiceStub } from "../fakes/fake-invoices-read.js";
import { FakeAccountingDocumentRepository } from "../fakes/fake-accounting-document-repository.js";

const ORG = mintOrganizationId("org-test");

describe("ListAccountingDocumentsUseCase", () => {
  it("agrega invoices (source=invoice) e AccountingDocuments (source=accounting_document), ordenados por data desc", async () => {
    const listInvoices = new FakeListInvoices();
    const repository = new FakeAccountingDocumentRepository();
    listInvoices.rows = [invoiceStub({ id: "inv-1", invoiceDate: "2026-07-01", documentType: "invoice" })];
    repository.seed(
      AccountingDocument.create({
        organizationId: ORG,
        documentType: "partner_invoice",
        fundingSource: "partner",
        entityName: "Sócio A",
        issueDate: "2026-07-10",
        subtotalWithoutVat: 1000,
        vatAmount: 130,
        totalWithVat: 1130,
        vatDeductibleAmount: 130,
        vatNonDeductibleAmount: 0,
        settlementMethod: "reimbursement",
        createdBy: "user@fonsat.pt",
      }),
    );

    const useCase = new ListAccountingDocumentsUseCase(listInvoices, repository);
    const rows = await useCase.execute({ organizationId: ORG });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.source).toBe("accounting_document");
    expect(rows[1]?.source).toBe("invoice");
  });
});
