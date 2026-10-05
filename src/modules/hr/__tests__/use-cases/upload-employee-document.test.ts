import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { Document as EmployeeDocument } from "../../../documents/domain/entities/document.js";
import { UploadEmployeeDocumentUseCase } from "../../application/use-cases/upload-employee-document.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeDocumentRepository } from "../../../documents/__tests__/fakes/fake-document-repository.js";
import { FakeHrFileStorage } from "../fakes/fake-hr-file-storage.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakeDocumentCategoryRepository } from "../../../documents/__tests__/fakes/fake-document-category-repository.js";
import {
  EmployeeNotFoundError,
  DocumentCategoryAlreadyExistsError,
  DocumentPeriodAlreadyExistsError,
  InvalidDocumentError,
} from "../../domain/errors.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const employees = new FakeEmployeeRepository();
  const documents = new FakeDocumentRepository();
  const storage = new FakeHrFileStorage();
  const auditLog = new FakeHrAuditLog();
  return { employees, documents, storage, auditLog, useCase: new UploadEmployeeDocumentUseCase(employees, documents, storage, auditLog, new FakeDocumentCategoryRepository()) };
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
        owner: { type: "employee", id: e.id },
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

  describe("categoria periódica (Recibo de vencimento, ticket 10)", () => {
    function payslip(employeeId: string, period: string | null) {
      return {
        organizationId: ORG,
        actor: "rh@angrybox.com",
        employeeId,
        category: "recibo_vencimento",
        mandatory: true,
        origin: "rh" as const,
        expiresAt: null,
        period,
        buffer: Buffer.from("pdf"),
        filename: "recibo.pdf",
        mimeType: "application/pdf",
      };
    }

    it("exige o período e nunca fica obrigatório", async () => {
      const { employees, useCase } = makeUseCase();
      const e = Employee.create({ fullName: "Andres Silva" });
      employees.seed(ORG, e);
      await expect(useCase.execute(payslip(e.id, null))).rejects.toThrow(InvalidDocumentError);
      await expect(useCase.execute(payslip(e.id, "2026-09"))).resolves.toMatchObject({ period: "2026-09", mandatory: false });
    });

    it("um por período: outro mês é aceite, o mesmo mês é bloqueado", async () => {
      const { employees, useCase } = makeUseCase();
      const e = Employee.create({ fullName: "Andres Silva" });
      employees.seed(ORG, e);
      await useCase.execute(payslip(e.id, "2026-09"));
      await expect(useCase.execute(payslip(e.id, "2026-10"))).resolves.toMatchObject({ period: "2026-10" });
      await expect(useCase.execute(payslip(e.id, "2026-09"))).rejects.toThrow(DocumentPeriodAlreadyExistsError);
    });

    it("categoria não periódica recusa período", async () => {
      const { employees, useCase } = makeUseCase();
      const e = Employee.create({ fullName: "Andres Silva" });
      employees.seed(ORG, e);
      await expect(useCase.execute({ ...payslip(e.id, "2026-09"), category: "nif" })).rejects.toThrow(InvalidDocumentError);
    });
  });
});
