import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { EmployeeDocument } from "../../domain/entities/employee-document.js";
import { DocumentCategoryDefinition } from "../../domain/entities/document-category.js";
import { GetDocumentOverviewUseCase } from "../../application/use-cases/get-document-overview.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeEmployeeDocumentRepository } from "../fakes/fake-employee-document-repository.js";
import { FakeDocumentCategoryRepository } from "../fakes/fake-document-category-repository.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const employees = new FakeEmployeeRepository();
  const documents = new FakeEmployeeDocumentRepository();
  const categories = new FakeDocumentCategoryRepository();
  return { employees, documents, categories, useCase: new GetDocumentOverviewUseCase(employees, documents, categories) };
}

describe("GetDocumentOverviewUseCase", () => {
  it("1 linha por requisito aplicável ao colaborador — inclui obrigatórios e opcionais, mesmo sem documento", async () => {
    const { employees, useCase } = makeUseCase();
    const e = Employee.create({ fullName: "Sem Documentos" });
    employees.seed(ORG, e);

    const rows = await useCase.execute({ organizationId: ORG });

    expect(rows.every((r) => r.employeeId === e.id)).toBe(true);
    expect(rows.every((r) => r.employeeName === "Sem Documentos")).toBe(true);
    // identificação + 3 categorias obrigatórias por omissão + 5 opcionais (ver FakeDocumentCategoryRepository) = 9.
    expect(rows).toHaveLength(9);
    expect(rows.every((r) => r.status === "missing")).toBe(true);
  });

  it("nunca inclui colaboradores inativos", async () => {
    const { employees, useCase } = makeUseCase();
    employees.seed(ORG, Employee.create({ fullName: "Inativo" }).deactivate());

    const rows = await useCase.execute({ organizationId: ORG });

    expect(rows).toEqual([]);
  });

  it("documento enviado aparece com o seu id/validade/estado real", async () => {
    const { employees, documents, useCase } = makeUseCase();
    const e = Employee.create({ fullName: "Com Contrato" });
    employees.seed(ORG, e);
    documents.seed(
      ORG,
      EmployeeDocument.createFirstVersion({
        employeeId: e.id,
        category: "contrato_trabalho",
        mandatory: true,
        fileName: "contrato.pdf",
        storagePath: "x/contrato.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 10,
        origin: "rh",
        expiresAt: "2030-01-01",
        uploadedBy: "rh@angrybox.com",
      }),
    );

    const rows = await useCase.execute({ organizationId: ORG });
    const row = rows.find((r) => r.requirementId === "contrato_trabalho");

    expect(row?.status).toBe("ok");
    expect(row?.expiresAt).toBe("2030-01-01");
    expect(row?.documentId).not.toBeNull();
  });

  it("categorias com jobRoles restrito só aparecem para colaboradores com esse cargo", async () => {
    const { employees, categories, useCase } = makeUseCase();
    const manager = Employee.create({ fullName: "Gerente", jobRole: "manager" });
    const service = Employee.create({ fullName: "Serviço", jobRole: "service" });
    employees.seed(ORG, manager);
    employees.seed(ORG, service);
    const defs = await categories.findMany(ORG);
    categories.seedOverride(ORG, [
      ...defs,
      DocumentCategoryDefinition.create({
        organizationId: String(ORG),
        slug: "carta_conducao",
        label: "Carta de condução",
        mandatory: false,
        jobRoles: ["manager"],
        acceptedMimeTypes: ["application/pdf"],
      }),
    ]);

    const rows = await useCase.execute({ organizationId: ORG });

    expect(rows.some((r) => r.employeeId === manager.id && r.requirementId === "carta_conducao")).toBe(true);
    expect(rows.some((r) => r.employeeId === service.id && r.requirementId === "carta_conducao")).toBe(false);
  });
});
