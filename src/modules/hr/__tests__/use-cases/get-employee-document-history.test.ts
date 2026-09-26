import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { EmployeeDocument } from "../../domain/entities/employee-document.js";
import { GetEmployeeDocumentHistoryUseCase } from "../../application/use-cases/get-employee-document-history.use-case.js";
import { FakeEmployeeDocumentRepository } from "../fakes/fake-employee-document-repository.js";
import { EmployeeDocumentNotFoundError } from "../../domain/errors.js";

const ORG = mintOrganizationId("org-test");

describe("GetEmployeeDocumentHistoryUseCase", () => {
  it("devolve toda a cadeia de versões, mais recente primeiro", async () => {
    const documents = new FakeEmployeeDocumentRepository();
    const v1 = EmployeeDocument.createFirstVersion({
      employeeId: "e1",
      category: "cartao_cidadao",
      mandatory: true,
      fileName: "cc.pdf",
      storagePath: "e1/v1/cc.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      origin: "rh",
      expiresAt: null,
      uploadedBy: "rh@angrybox.com",
    });
    const v2 = v1.supersede({
      fileName: "cc-v2.pdf",
      storagePath: "e1/v2/cc-v2.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 20,
      expiresAt: null,
      uploadedBy: "rh@angrybox.com",
    });
    documents.seed(ORG, v1.markSuperseded());
    documents.seed(ORG, v2);

    const useCase = new GetEmployeeDocumentHistoryUseCase(documents);
    const result = await useCase.execute({ organizationId: ORG, employeeId: "e1", documentId: v2.id });

    expect(result.map((d) => d.version)).toEqual([2, 1]);
  });

  it("lança EmployeeDocumentNotFoundError para id inexistente", async () => {
    const useCase = new GetEmployeeDocumentHistoryUseCase(new FakeEmployeeDocumentRepository());
    await expect(
      useCase.execute({ organizationId: ORG, employeeId: "e1", documentId: "x" }),
    ).rejects.toThrow(EmployeeDocumentNotFoundError);
  });
});
