import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { UpdateDocumentCategoryUseCase } from "../../application/use-cases/update-document-category.use-case.js";
import { CreateDocumentCategoryUseCase } from "../../application/use-cases/create-document-category.use-case.js";
import { FakeDocumentCategoryRepository } from "../fakes/fake-document-category-repository.js";
import { DocumentCategoryConfigNotFoundError } from "../../domain/errors.js";

const ORG = mintOrganizationId("org-test");

describe("UpdateDocumentCategoryUseCase", () => {
  it("edita só os campos passados, preservando o resto", async () => {
    const categories = new FakeDocumentCategoryRepository();
    const created = await new CreateDocumentCategoryUseCase(categories).execute({
      organizationId: ORG,
      label: "Seguro de saúde",
      mandatory: false,
      jobRoles: [],
      acceptedMimeTypes: ["application/pdf"],
    });

    const useCase = new UpdateDocumentCategoryUseCase(categories);
    const updated = await useCase.execute({ organizationId: ORG, id: created.id, mandatory: true });

    expect(updated.mandatory).toBe(true);
    expect(updated.label).toBe("Seguro de saúde");
  });

  it("lança DocumentCategoryConfigNotFoundError para id inexistente", async () => {
    const categories = new FakeDocumentCategoryRepository();
    const useCase = new UpdateDocumentCategoryUseCase(categories);

    await expect(
      useCase.execute({ organizationId: ORG, id: "inexistente", mandatory: true }),
    ).rejects.toThrow(DocumentCategoryConfigNotFoundError);
  });

  it("atualiza jobRoles e acceptedMimeTypes", async () => {
    const categories = new FakeDocumentCategoryRepository();
    const created = await new CreateDocumentCategoryUseCase(categories).execute({
      organizationId: ORG,
      label: "Seguro de saúde",
      mandatory: false,
      jobRoles: [],
      acceptedMimeTypes: ["application/pdf"],
    });

    const useCase = new UpdateDocumentCategoryUseCase(categories);
    const updated = await useCase.execute({
      organizationId: ORG,
      id: created.id,
      jobRoles: ["manager"],
      acceptedMimeTypes: ["image/png"],
    });

    expect(updated.jobRoles).toEqual(["manager"]);
    expect(updated.acceptedMimeTypes).toEqual(["image/png"]);
  });
});
