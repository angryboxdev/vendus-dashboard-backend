import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ListDocumentCategoriesUseCase } from "../../application/use-cases/list-document-categories.use-case.js";
import { FakeDocumentCategoryRepository } from "../fakes/fake-document-category-repository.js";

const ORG = mintOrganizationId("org-test");

describe("ListDocumentCategoriesUseCase", () => {
  it("devolve as categorias semeadas por omissão", async () => {
    const categories = new FakeDocumentCategoryRepository();
    const useCase = new ListDocumentCategoriesUseCase(categories);

    const result = await useCase.execute({ organizationId: ORG });

    expect(result.map((c) => c.slug).sort()).toEqual(
      [
        "apolice_seguro_at",
        "atestado_saude",
        "certificado_morada",
        "comprovativo_iban",
        "contrato_trabalho",
        "ficha_colaborador",
        "formacao_seguranca",
        "nif",
        "recibo_vencimento",
        "recibo_verde",
      ].sort(),
    );
  });
});
