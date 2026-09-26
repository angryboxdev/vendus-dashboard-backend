import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { SetDocumentCategoryActiveUseCase } from "../../application/use-cases/set-document-category-active.use-case.js";
import { CreateDocumentCategoryUseCase } from "../../application/use-cases/create-document-category.use-case.js";
import { FakeDocumentCategoryRepository } from "../fakes/fake-document-category-repository.js";
import { DocumentCategoryConfigNotFoundError } from "../../domain/errors.js";

const ORG = mintOrganizationId("org-test");

describe("SetDocumentCategoryActiveUseCase", () => {
  it("desativa uma categoria sem apagá-la", async () => {
    const categories = new FakeDocumentCategoryRepository();
    const created = await new CreateDocumentCategoryUseCase(categories).execute({
      organizationId: ORG,
      label: "Seguro de saúde",
      mandatory: false,
      jobRoles: [],
      acceptedMimeTypes: ["application/pdf"],
    });

    const useCase = new SetDocumentCategoryActiveUseCase(categories);
    const result = await useCase.execute({ organizationId: ORG, id: created.id, active: false });

    expect(result.active).toBe(false);
    expect(await categories.findById(ORG, created.id)).not.toBeNull();
  });

  it("reativa uma categoria previamente desativada", async () => {
    const categories = new FakeDocumentCategoryRepository();
    const created = await new CreateDocumentCategoryUseCase(categories).execute({
      organizationId: ORG,
      label: "Seguro de saúde",
      mandatory: false,
      jobRoles: [],
      acceptedMimeTypes: ["application/pdf"],
    });
    const useCase = new SetDocumentCategoryActiveUseCase(categories);
    await useCase.execute({ organizationId: ORG, id: created.id, active: false });

    const result = await useCase.execute({ organizationId: ORG, id: created.id, active: true });

    expect(result.active).toBe(true);
  });

  it("lança DocumentCategoryConfigNotFoundError para id inexistente", async () => {
    const categories = new FakeDocumentCategoryRepository();
    const useCase = new SetDocumentCategoryActiveUseCase(categories);

    await expect(
      useCase.execute({ organizationId: ORG, id: "inexistente", active: false }),
    ).rejects.toThrow(DocumentCategoryConfigNotFoundError);
  });
});
