import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateDocumentCategoryUseCase, slugifyLabel } from "../../application/use-cases/create-document-category.use-case.js";
import { FakeDocumentCategoryRepository } from "../fakes/fake-document-category-repository.js";
import { InvalidEmployeeError, DocumentCategoryConfigAlreadyExistsError } from "../../domain/errors.js";

const ORG = mintOrganizationId("org-test");

describe("slugifyLabel", () => {
  it("normaliza acentos, minúsculas e espaços", () => {
    expect(slugifyLabel("Certificado de Residência")).toBe("certificado_de_residencia");
  });
});

describe("CreateDocumentCategoryUseCase", () => {
  it("cria uma categoria nova com slug gerado a partir do label", async () => {
    const categories = new FakeDocumentCategoryRepository();
    const useCase = new CreateDocumentCategoryUseCase(categories);

    const result = await useCase.execute({
      organizationId: ORG,
      label: "Seguro de saúde",
      mandatory: false,
      acceptedMimeTypes: ["application/pdf"],
    });

    expect(result.slug).toBe("seguro_de_saude");
    expect(result.active).toBe(true);
  });

  it("rejeita label vazio", async () => {
    const categories = new FakeDocumentCategoryRepository();
    const useCase = new CreateDocumentCategoryUseCase(categories);

    await expect(
      useCase.execute({ organizationId: ORG, label: "   ", mandatory: false, acceptedMimeTypes: [] }),
    ).rejects.toThrow(InvalidEmployeeError);
  });

  it("rejeita label que já existe (mesmo slug)", async () => {
    const categories = new FakeDocumentCategoryRepository();
    const useCase = new CreateDocumentCategoryUseCase(categories);
    await useCase.execute({
      organizationId: ORG,
      label: "Seguro de saúde",
      mandatory: false,
      acceptedMimeTypes: ["application/pdf"],
    });

    await expect(
      useCase.execute({
        organizationId: ORG,
        label: "Seguro de Saúde",
        mandatory: false,
        acceptedMimeTypes: ["application/pdf"],
      }),
    ).rejects.toThrow(DocumentCategoryConfigAlreadyExistsError);
  });

});
