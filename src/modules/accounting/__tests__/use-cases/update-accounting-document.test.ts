import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { AccountingDocument } from "../../domain/entities/accounting-document.js";
import { UpdateAccountingDocumentUseCase } from "../../application/use-cases/update-accounting-document.use-case.js";
import { PossibleDuplicateDocumentError } from "../../domain/errors.js";
import { FakeAccountingDocumentRepository } from "../fakes/fake-accounting-document-repository.js";
import { FakeAccountingDocumentAttachmentRepository } from "../fakes/fake-accounting-document-attachment-repository.js";
import { FakeAccountingAuditLog } from "../fakes/fake-accounting-audit-log.js";
import { FakeListCostCenterCategories, categoryStub } from "../fakes/fake-list-cost-center-categories.js";
import { FakeListInvoices } from "../fakes/fake-invoices-read.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const repository = new FakeAccountingDocumentRepository();
  const attachmentRepository = new FakeAccountingDocumentAttachmentRepository();
  const listCostCenterCategories = new FakeListCostCenterCategories();
  const listInvoices = new FakeListInvoices();
  const auditLog = new FakeAccountingAuditLog();
  const useCase = new UpdateAccountingDocumentUseCase(repository, attachmentRepository, listCostCenterCategories, listInvoices, auditLog);
  return { repository, listCostCenterCategories, listInvoices, auditLog, useCase };
}

function seedDocument(repository: FakeAccountingDocumentRepository, overrides: Partial<Parameters<typeof AccountingDocument.create>[0]> = {}) {
  const document = AccountingDocument.create({
    organizationId: ORG,
    documentType: "partner_invoice",
    fundingSource: "partner",
    entityName: "Sócio A",
    nif: "123456789",
    documentNumber: "FT 1",
    issueDate: "2026-07-20",
    subtotalWithoutVat: 1000,
    vatAmount: 130,
    totalWithVat: 1130,
    vatDeductibleAmount: 130,
    vatNonDeductibleAmount: 0,
    settlementMethod: "reimbursement",
    createdBy: "user@fonsat.pt",
    ...overrides,
  });
  repository.seed(document);
  return document;
}

describe("UpdateAccountingDocumentUseCase", () => {
  it("recalcula a dedutibilidade quando a subcategoria muda", async () => {
    const { repository, listCostCenterCategories, useCase } = makeUseCase();
    listCostCenterCategories.rows = [categoryStub({ id: "cat-non-deductible", vatDeductible: false })];
    const document = seedDocument(repository);

    const dto = await useCase.execute({
      organizationId: ORG,
      id: document.id,
      data: { costCenterCategoryId: "cat-non-deductible" },
      actor: "manager@fonsat.pt",
    });

    expect(dto.vatDeductibleAmount).toBe(0);
    expect(dto.vatNonDeductibleAmount).toBe(130);
  });

  it("não se deteta a si própria como duplicado", async () => {
    const { repository, useCase } = makeUseCase();
    const document = seedDocument(repository);

    const dto = await useCase.execute({
      organizationId: ORG,
      id: document.id,
      data: { notes: "Revisto" },
      actor: "manager@fonsat.pt",
    });

    expect(dto.notes).toBe("Revisto");
  });

  it("deteta duplicado contra outro documento existente", async () => {
    const { repository, useCase } = makeUseCase();
    seedDocument(repository, { nif: "999999999", documentNumber: "FT 2" });
    const document = seedDocument(repository);

    await expect(
      useCase.execute({
        organizationId: ORG,
        id: document.id,
        data: { nif: "999999999", documentNumber: "FT 2" },
        actor: "manager@fonsat.pt",
      }),
    ).rejects.toThrow(PossibleDuplicateDocumentError);
  });
});
