import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { EmployeeDocument } from "../../domain/entities/employee-document.js";
import { UploadEmployeeDocumentUseCase } from "../../application/use-cases/upload-employee-document.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeEmployeeDocumentRepository } from "../fakes/fake-employee-document-repository.js";
import { FakeHrFileStorage } from "../fakes/fake-hr-file-storage.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { EmployeeNotFoundError, DocumentCategoryAlreadyExistsError } from "../../domain/errors.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const employees = new FakeEmployeeRepository();
  const documents = new FakeEmployeeDocumentRepository();
  const storage = new FakeHrFileStorage();
  const auditLog = new FakeHrAuditLog();
  return { employees, documents, storage, auditLog, useCase: new UploadEmployeeDocumentUseCase(employees, documents, storage, auditLog) };
}

describe("UploadEmployeeDocumentUseCase", () => {
  it("lança EmployeeNotFoundError para funcionário inexistente", async () => {
    const { useCase } = makeUseCase();
    await expect(
      useCase.execute({
        organizationId: ORG,
        actor: "rh@angrybox.com",
        employeeId: "x",
        category: "nif",
        mandatory: true,
        origin: "rh",
        expiresAt: null,
        buffer: Buffer.from("pdf"),
        filename: "nif.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(EmployeeNotFoundError);
  });

  it("cria a primeira versão da categoria", async () => {
    const { employees, useCase } = makeUseCase();
    const e = Employee.create({ fullName: "Andres Silva" });
    employees.seed(ORG, e);

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "rh@angrybox.com",
      employeeId: e.id,
      category: "nif",
      mandatory: true,
      origin: "rh",
      expiresAt: null,
      buffer: Buffer.from("pdf"),
      filename: "nif.pdf",
      mimeType: "application/pdf",
    });

    expect(result.version).toBe(1);
    expect(result.displayStatus).toBe("ok");
  });

  it("rejeita nova categoria já existente como atual — obriga a usar 'substituir'", async () => {
    const { employees, documents, useCase } = makeUseCase();
    const e = Employee.create({ fullName: "Andres Silva" });
    employees.seed(ORG, e);
    documents.seed(
      ORG,
      EmployeeDocument.createFirstVersion({
        employeeId: e.id,
        category: "nif",
        mandatory: true,
        fileName: "nif.pdf",
        storagePath: "e1/nif.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 10,
        origin: "rh",
        expiresAt: null,
        uploadedBy: "rh@angrybox.com",
      }),
    );

    await expect(
      useCase.execute({
        organizationId: ORG,
        actor: "rh@angrybox.com",
        employeeId: e.id,
        category: "nif",
        mandatory: true,
        origin: "rh",
        expiresAt: null,
        buffer: Buffer.from("pdf"),
        filename: "nif2.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(DocumentCategoryAlreadyExistsError);
  });
});
