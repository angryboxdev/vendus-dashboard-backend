import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Document as EmployeeDocument } from "../../domain/entities/document.js";
import { GetEmployeeDocumentDownloadUrlUseCase } from "../../application/use-cases/get-employee-document-download-url.use-case.js";
import { FakeDocumentRepository } from "../fakes/fake-document-repository.js";
import { FakeEmployeeFileStorage } from "../fakes/fake-employee-file-storage.js";
import { EmployeeDocumentNotFoundError } from "../../domain/errors.js";

const ORG = mintOrganizationId("org-test");

describe("GetEmployeeDocumentDownloadUrlUseCase", () => {
  it("devolve um URL assinado (TTL curto) para o storagePath do documento", async () => {
    const documents = new FakeDocumentRepository();
    const storage = new FakeEmployeeFileStorage();
    const doc = EmployeeDocument.createFirstVersion({
      owner: { type: "employee", id: "e1" },
      category: "nif",
      mandatory: true,
      fileName: "nif.pdf",
      storagePath: "e1/nif.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      origin: "rh",
      expiresAt: null,
      uploadedBy: "rh@angrybox.com",
    });
    documents.seed(ORG, doc);

    const useCase = new GetEmployeeDocumentDownloadUrlUseCase(documents, storage);
    const result = await useCase.execute({ organizationId: ORG, employeeId: "e1", documentId: doc.id });

    expect(result.url).toContain("e1/nif.pdf");
    expect(result.url).toContain("ttl=120");
  });

  it("lança EmployeeDocumentNotFoundError quando o documento não pertence ao colaborador indicado", async () => {
    const documents = new FakeDocumentRepository();
    const doc = EmployeeDocument.createFirstVersion({
      owner: { type: "employee", id: "e1" },
      category: "nif",
      mandatory: true,
      fileName: "nif.pdf",
      storagePath: "e1/nif.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      origin: "rh",
      expiresAt: null,
      uploadedBy: "rh@angrybox.com",
    });
    documents.seed(ORG, doc);

    const useCase = new GetEmployeeDocumentDownloadUrlUseCase(documents, new FakeEmployeeFileStorage());
    await expect(
      useCase.execute({ organizationId: ORG, employeeId: "outro", documentId: doc.id }),
    ).rejects.toThrow(EmployeeDocumentNotFoundError);
  });
});
