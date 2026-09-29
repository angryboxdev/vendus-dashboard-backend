import { DocumentCategoryDefinition } from "../../domain/entities/document-category.js";

describe("DocumentCategoryDefinition", () => {
  it("create() começa ativa", () => {
    const def = DocumentCategoryDefinition.create({
      organizationId: "org-1",
      slug: "seguro_saude",
      label: "Seguro de saúde",
      mandatory: false,
      jobRoles: [],
      acceptedMimeTypes: ["application/pdf"],
    });
    expect(def.active).toBe(true);
  });

  it("update() muda só os campos passados, preservando o resto", () => {
    const def = DocumentCategoryDefinition.create({
      organizationId: "org-1",
      slug: "seguro_saude",
      label: "Seguro de saúde",
      mandatory: false,
      jobRoles: [],
      acceptedMimeTypes: ["application/pdf"],
    });
    const updated = def.update({ mandatory: true });
    expect(updated.mandatory).toBe(true);
    expect(updated.label).toBe("Seguro de saúde");
    expect(updated.id).toBe(def.id);
  });

  it("setActive(false) desativa sem apagar nada", () => {
    const def = DocumentCategoryDefinition.create({
      organizationId: "org-1",
      slug: "seguro_saude",
      label: "Seguro de saúde",
      mandatory: false,
      jobRoles: [],
      acceptedMimeTypes: ["application/pdf"],
    });
    const inactive = def.setActive(false);
    expect(inactive.active).toBe(false);
    expect(inactive.slug).toBe(def.slug);
  });

  it("reconstitute() devolve uma instância com exatamente os props dados", () => {
    const props = {
      id: "id-1",
      organizationId: "org-1",
      slug: "seguro_saude",
      label: "Seguro de saúde",
      mandatory: true,
      jobRoles: ["manager" as const],
      acceptedMimeTypes: ["application/pdf"],
      active: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    const def = DocumentCategoryDefinition.reconstitute(props);
    expect(def.toProps()).toEqual(props);
  });
});
