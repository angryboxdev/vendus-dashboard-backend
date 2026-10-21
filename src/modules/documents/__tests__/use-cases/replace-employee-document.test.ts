import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Document as EmployeeDocument } from "../../domain/entities/document.js";
import { ReplaceEmployeeDocumentUseCase } from "../../application/use-cases/replace-employee-document.use-case.js";
import { FakeEmployeeDirectory, employee } from "../fakes/fake-employee-directory.js";
import { FakeDocumentRepository } from "../fakes/fake-document-repository.js";
import { FakeEmployeeFileStorage } from "../fakes/fake-employee-file-storage.js";
import { FakeDocumentAuditLog } from "../fakes/fake-document-audit-log.js";

const ORG = mintOrganizationId("org-test");

describe("ReplaceEmployeeDocumentUseCase", () => {
  it("cria uma nova versão, marca a anterior isCurrent=false e NUNCA remove o ficheiro antigo do storage", async () => {
    const employees = new FakeEmployeeDirectory();
    const documents = new FakeDocumentRepository();
    const storage = new FakeEmployeeFileStorage();
    const auditLog = new FakeDocumentAuditLog();

    const e = employee({ fullName: "Andres Silva" });
    employees.seed(ORG, e);
    const v1 = EmployeeDocument.createFirstVersion({
      owner: { type: "employee", id: e.id },
      category: "cartao_cidadao",
      mandatory: true,
      fileName: "cc.pdf",
      storagePath: "e1/v1/cc.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      origin: "rh",
      expiresAt: "2026-08-01",
      uploadedBy: "rh@angrybox.com",
    });
    documents.seed(ORG, v1);

    const useCase = new ReplaceEmployeeDocumentUseCase(employees, documents, storage, auditLog);
    const result = await useCase.execute({
      organizationId: ORG,
      actor: "rh@angrybox.com",
      employeeId: e.id,
      documentId: v1.id,
      buffer: Buffer.from("pdf-v2"),
      filename: "cc-v2.pdf",
      mimeType: "application/pdf",
    });

    expect(result.version).toBe(2);
    expect(result.previousVersionId).toBe(v1.id);

    const oldVersion = await documents.findById(ORG, v1.id);
    expect(oldVersion!.isCurrent).toBe(false);
    expect(oldVersion!.storagePath).toBe("e1/v1/cc.pdf"); // ficheiro/linha antigos preservados

    expect(storage.removed).toHaveLength(0); // nunca apaga evidência anterior
    expect(auditLog.entries[0]!.action).toBe("document_replaced");
  });

  it("herda expiresAt da versão anterior quando não é fornecido de novo", async () => {
    const employees = new FakeEmployeeDirectory();
    const documents = new FakeDocumentRepository();
    const storage = new FakeEmployeeFileStorage();
    const auditLog = new FakeDocumentAuditLog();

    const e = employee({ fullName: "Andres Silva" });
    employees.seed(ORG, e);
    const v1 = EmployeeDocument.createFirstVersion({
      owner: { type: "employee", id: e.id },
      category: "cartao_cidadao",
      mandatory: true,
      fileName: "cc.pdf",
      storagePath: "e1/v1/cc.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      origin: "rh",
      expiresAt: "2026-08-01",
      uploadedBy: "rh@angrybox.com",
    });
    documents.seed(ORG, v1);

    const useCase = new ReplaceEmployeeDocumentUseCase(employees, documents, storage, auditLog);
    const result = await useCase.execute({
      organizationId: ORG,
      actor: "rh@angrybox.com",
      employeeId: e.id,
      documentId: v1.id,
      buffer: Buffer.from("pdf-v2"),
      filename: "cc-v2.pdf",
      mimeType: "application/pdf",
    });

    expect(result.expiresAt).toBe("2026-08-01");
  });
});
