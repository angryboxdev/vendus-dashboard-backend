import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateAccountingDocumentUseCase } from "../../application/use-cases/create-accounting-document.use-case.js";
import { PossibleDuplicateDocumentError } from "../../domain/errors.js";
import { FakeAccountingDocumentRepository } from "../fakes/fake-accounting-document-repository.js";
import { FakeAccountingAuditLog } from "../fakes/fake-accounting-audit-log.js";
import { FakeListCostCenterCategories, categoryStub } from "../fakes/fake-list-cost-center-categories.js";
import { FakeListInvoices, invoiceStub } from "../fakes/fake-invoices-read.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const repository = new FakeAccountingDocumentRepository();
  const listCostCenterCategories = new FakeListCostCenterCategories();
  const listInvoices = new FakeListInvoices();
  const auditLog = new FakeAccountingAuditLog();
  const useCase = new CreateAccountingDocumentUseCase(repository, listCostCenterCategories, listInvoices, auditLog);
  return { repository, listCostCenterCategories, listInvoices, auditLog, useCase };
}

function baseCommand() {
  return {
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
    settlementMethod: "reimbursement",
    actor: "user@fonsat.pt",
  };
}

describe("CreateAccountingDocumentUseCase", () => {
  it("cria o documento e regista auditoria", async () => {
    const { auditLog, useCase } = makeUseCase();
    const dto = await useCase.execute(baseCommand());
    expect(dto.status).toBe("pending_review");
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]?.action).toBe("create");
  });

  it("resolve a dedutibilidade a partir da subcategoria quando não há override", async () => {
    const { listCostCenterCategories, useCase } = makeUseCase();
    listCostCenterCategories.rows = [categoryStub({ id: "cat-1", vatDeductible: false })];
    const dto = await useCase.execute({ ...baseCommand(), costCenterCategoryId: "cat-1" });
    expect(dto.vatDeductibleAmount).toBe(0);
    expect(dto.vatNonDeductibleAmount).toBe(130);
  });

  it("um override explícito tem prioridade sobre a subcategoria", async () => {
    const { listCostCenterCategories, useCase } = makeUseCase();
    listCostCenterCategories.rows = [categoryStub({ id: "cat-1", vatDeductible: false })];
    const dto = await useCase.execute({
      ...baseCommand(),
      costCenterCategoryId: "cat-1",
      deductiblePercentage: 100,
      deductibilityOverrideReason: "Uso profissional confirmado",
    });
    expect(dto.vatDeductibleAmount).toBe(130);
  });

  it("rejeita um documento com o mesmo NIF+número+data+total de outro já existente", async () => {
    const { useCase } = makeUseCase();
    await useCase.execute(baseCommand());
    await expect(useCase.execute(baseCommand())).rejects.toThrow(PossibleDuplicateDocumentError);
  });

  it("confirmDuplicate: true força a criação mesmo com um candidato encontrado", async () => {
    const { useCase } = makeUseCase();
    await useCase.execute(baseCommand());
    const dto = await useCase.execute({ ...baseCommand(), confirmDuplicate: true });
    expect(dto).toBeDefined();
  });

  it("rejeita quando já existe uma fatura (invoices) com o mesmo número/data/total", async () => {
    const { listInvoices, useCase } = makeUseCase();
    listInvoices.rows = [
      invoiceStub({ id: "inv-1", invoiceNumber: "FT 1", invoiceDate: "2026-07-20", totalWithVat: 1130 }),
    ];
    await expect(useCase.execute(baseCommand())).rejects.toThrow(PossibleDuplicateDocumentError);
  });
});
