import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { EmployeeDocument } from "../../domain/entities/employee-document.js";
import { RemoveEmployeeDocumentUseCase } from "../../application/use-cases/remove-employee-document.use-case.js";
import { FakeEmployeeDocumentRepository } from "../fakes/fake-employee-document-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { EmployeeDocumentNotFoundError } from "../../domain/errors.js";

const ORG = mintOrganizationId("org-test");

describe("RemoveEmployeeDocumentUseCase", () => {
  it("marca removed/isCurrent=false sem apagar a linha nem o ficheiro", async () => {
    const documents = new FakeEmployeeDocumentRepository();
    const auditLog = new FakeHrAuditLog();
    const doc = EmployeeDocument.createFirstVersion({
      employeeId: "e1",
      category: "outro",
      mandatory: false,
      fileName: "x.pdf",
      storagePath: "e1/x.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      origin: "rh",
      expiresAt: null,
      uploadedBy: "rh@angrybox.com",
    });
    documents.seed(ORG, doc);

    const useCase = new RemoveEmployeeDocumentUseCase(documents, auditLog);
    await useCase.execute({ organizationId: ORG, actor: "rh@angrybox.com", employeeId: "e1", documentId: doc.id });

    const removed = await documents.findById(ORG, doc.id);
    expect(removed!.status).toBe("removed");
    expect(removed!.isCurrent).toBe(false);
    expect(removed!.storagePath).toBe("e1/x.pdf");
    expect(auditLog.entries[0]!.action).toBe("document_removed");
  });

  it("lança EmployeeDocumentNotFoundError se o documento não pertence ao colaborador indicado", async () => {
    const documents = new FakeEmployeeDocumentRepository();
    const doc = EmployeeDocument.createFirstVersion({
      employeeId: "e1",
      category: "outro",
      mandatory: false,
      fileName: "x.pdf",
      storagePath: "e1/x.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      origin: "rh",
      expiresAt: null,
      uploadedBy: "rh@angrybox.com",
    });
    documents.seed(ORG, doc);

    const useCase = new RemoveEmployeeDocumentUseCase(documents, new FakeHrAuditLog());
    await expect(
      useCase.execute({ organizationId: ORG, actor: "rh@angrybox.com", employeeId: "outro-colaborador", documentId: doc.id }),
    ).rejects.toThrow(EmployeeDocumentNotFoundError);
  });
});
