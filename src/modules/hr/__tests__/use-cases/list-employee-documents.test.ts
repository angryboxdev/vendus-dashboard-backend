import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { EmployeeDocument } from "../../domain/entities/employee-document.js";
import { ListEmployeeDocumentsUseCase } from "../../application/use-cases/list-employee-documents.use-case.js";
import { FakeEmployeeDocumentRepository } from "../fakes/fake-employee-document-repository.js";

const ORG = mintOrganizationId("org-test");

describe("ListEmployeeDocumentsUseCase", () => {
  it("só devolve versões atuais, com o displayStatus calculado", async () => {
    const documents = new FakeEmployeeDocumentRepository();
    const v1 = EmployeeDocument.createFirstVersion({
      employeeId: "e1",
      category: "contrato_trabalho",
      mandatory: true,
      fileName: "contrato.pdf",
      storagePath: "e1/v1/contrato.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      origin: "rh",
      expiresAt: null,
      uploadedBy: "rh@angrybox.com",
    });
    const v2 = v1.supersede({
      fileName: "contrato-v2.pdf",
      storagePath: "e1/v2/contrato-v2.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 20,
      expiresAt: null,
      uploadedBy: "rh@angrybox.com",
    });
    documents.seed(ORG, v1.markSuperseded());
    documents.seed(ORG, v2);

    const useCase = new ListEmployeeDocumentsUseCase(documents);
    const result = await useCase.execute({ organizationId: ORG, employeeId: "e1" });

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(v2.id);
    expect(result[0]!.version).toBe(2);
    expect(result[0]!.displayStatus).toBe("ok");
  });
});
