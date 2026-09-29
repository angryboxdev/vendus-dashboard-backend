import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { AccountingDocument } from "../../domain/entities/accounting-document.js";
import { GetAccountingDocumentUseCase } from "../../application/use-cases/get-accounting-document.use-case.js";
import { ValidateAccountingDocumentUseCase } from "../../application/use-cases/validate-accounting-document.use-case.js";
import { MarkAccountingDocumentPendencyUseCase } from "../../application/use-cases/mark-accounting-document-pendency.use-case.js";
import { CancelAccountingDocumentUseCase } from "../../application/use-cases/cancel-accounting-document.use-case.js";
import { UploadAccountingDocumentAttachmentUseCase } from "../../application/use-cases/upload-accounting-document-attachment.use-case.js";
import { AccountingDocumentNotFoundError, CancellationReasonRequiredError } from "../../domain/errors.js";
import { FakeAccountingDocumentRepository } from "../fakes/fake-accounting-document-repository.js";
import { FakeAccountingDocumentAttachmentRepository } from "../fakes/fake-accounting-document-attachment-repository.js";
import { FakeAccountingAuditLog } from "../fakes/fake-accounting-audit-log.js";
import { FakeAccountingDocumentStorage } from "../fakes/fake-accounting-document-storage.js";

const ORG = mintOrganizationId("org-test");

function seedDocument(repository: FakeAccountingDocumentRepository) {
  const document = AccountingDocument.create({
    organizationId: ORG,
    documentType: "partner_invoice",
    fundingSource: "partner",
    entityName: "Sócio A",
    issueDate: "2026-07-20",
    subtotalWithoutVat: 1000,
    vatAmount: 130,
    totalWithVat: 1130,
    vatDeductibleAmount: 130,
    vatNonDeductibleAmount: 0,
    settlementMethod: "reimbursement",
    createdBy: "user@fonsat.pt",
  });
  repository.seed(document);
  return document;
}

describe("GetAccountingDocumentUseCase", () => {
  it("lança AccountingDocumentNotFoundError quando o id não existe", async () => {
    const repository = new FakeAccountingDocumentRepository();
    const attachmentRepository = new FakeAccountingDocumentAttachmentRepository();
    const useCase = new GetAccountingDocumentUseCase(repository, attachmentRepository);
    await expect(useCase.execute({ organizationId: ORG, id: "missing" })).rejects.toThrow(AccountingDocumentNotFoundError);
  });
});

describe("ValidateAccountingDocumentUseCase", () => {
  it("muda o estado para validated e regista auditoria", async () => {
    const repository = new FakeAccountingDocumentRepository();
    const attachmentRepository = new FakeAccountingDocumentAttachmentRepository();
    const auditLog = new FakeAccountingAuditLog();
    const document = seedDocument(repository);
    const useCase = new ValidateAccountingDocumentUseCase(repository, attachmentRepository, auditLog);

    const dto = await useCase.execute({ organizationId: ORG, id: document.id, actor: "manager@fonsat.pt" });

    expect(dto.status).toBe("validated");
    expect(auditLog.entries[0]?.action).toBe("validate");
  });
});

describe("MarkAccountingDocumentPendencyUseCase", () => {
  it("muda o estado para with_pendency", async () => {
    const repository = new FakeAccountingDocumentRepository();
    const attachmentRepository = new FakeAccountingDocumentAttachmentRepository();
    const auditLog = new FakeAccountingAuditLog();
    const document = seedDocument(repository);
    const useCase = new MarkAccountingDocumentPendencyUseCase(repository, attachmentRepository, auditLog);

    const dto = await useCase.execute({ organizationId: ORG, id: document.id, actor: "manager@fonsat.pt" });

    expect(dto.status).toBe("with_pendency");
  });
});

describe("CancelAccountingDocumentUseCase", () => {
  it("exige motivo e nunca apaga o documento", async () => {
    const repository = new FakeAccountingDocumentRepository();
    const attachmentRepository = new FakeAccountingDocumentAttachmentRepository();
    const auditLog = new FakeAccountingAuditLog();
    const document = seedDocument(repository);
    const useCase = new CancelAccountingDocumentUseCase(repository, attachmentRepository, auditLog);

    await expect(
      useCase.execute({ organizationId: ORG, id: document.id, reason: "", actor: "manager@fonsat.pt" }),
    ).rejects.toThrow(CancellationReasonRequiredError);

    const dto = await useCase.execute({ organizationId: ORG, id: document.id, reason: "Duplicado", actor: "manager@fonsat.pt" });
    expect(dto.status).toBe("cancelled");
    expect(await repository.findById(ORG, document.id)).not.toBeNull();
  });
});

describe("UploadAccountingDocumentAttachmentUseCase", () => {
  it("cada upload cria uma versão nova, nunca substitui a anterior", async () => {
    const repository = new FakeAccountingDocumentRepository();
    const attachmentRepository = new FakeAccountingDocumentAttachmentRepository();
    const auditLog = new FakeAccountingAuditLog();
    const storage = new FakeAccountingDocumentStorage();
    const document = seedDocument(repository);
    const useCase = new UploadAccountingDocumentAttachmentUseCase(repository, attachmentRepository, storage, auditLog);

    await useCase.execute({
      organizationId: ORG,
      id: document.id,
      buffer: Buffer.from("v1"),
      filename: "doc.pdf",
      mimeType: "application/pdf",
      actor: "user@fonsat.pt",
    });
    const dto = await useCase.execute({
      organizationId: ORG,
      id: document.id,
      buffer: Buffer.from("v2"),
      filename: "doc.pdf",
      mimeType: "application/pdf",
      actor: "user@fonsat.pt",
    });

    expect(dto.attachments).toHaveLength(2);
    expect(dto.attachments.map((a) => a.version).sort()).toEqual([1, 2]);
  });
});
