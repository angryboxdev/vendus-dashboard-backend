import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { Document as EmployeeDocument } from "../../../documents/domain/entities/document.js";
import { GetPeopleKpisUseCase } from "../../application/use-cases/get-people-kpis.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeDocumentRepository } from "../../../documents/__tests__/fakes/fake-document-repository.js";
import { FakeDocumentCategoryRepository } from "../../../documents/__tests__/fakes/fake-document-category-repository.js";

const ORG = mintOrganizationId("org-test");

describe("GetPeopleKpisUseCase", () => {
  it("conta activeEmployees só entre os ativos", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const categories = new FakeDocumentCategoryRepository();
    employees.seed(ORG, Employee.create({ fullName: "Ativo" }));
    employees.seed(ORG, Employee.create({ fullName: "Inativo" }).deactivate());

    const useCase = new GetPeopleKpisUseCase(employees, documents, categories);
    const result = await useCase.execute(ORG);

    expect(result.activeEmployees).toBe(1);
  });

  it("perfil incompleto gera incompleteProfiles + pendência prioritária", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const categories = new FakeDocumentCategoryRepository();
    employees.seed(ORG, Employee.create({ fullName: "Incompleto" }));

    const useCase = new GetPeopleKpisUseCase(employees, documents, categories);
    const result = await useCase.execute(ORG);

    expect(result.incompleteProfiles).toBe(1);
    expect(result.priorityPendencies.some((p) => p.kind === "missing_field")).toBe(true);
  });

  it("contacto de emergência em falta gera pendência prioritária dedicada", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const categories = new FakeDocumentCategoryRepository();
    employees.seed(ORG, Employee.create({ fullName: "Sem Contacto" }));

    const useCase = new GetPeopleKpisUseCase(employees, documents, categories);
    const result = await useCase.execute(ORG);

    expect(result.priorityPendencies.some((p) => p.detail.includes("emergência"))).toBe(true);
  });

  it("documento obrigatório em falta gera missing_document", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const categories = new FakeDocumentCategoryRepository();
    employees.seed(ORG, Employee.create({ fullName: "Sem Docs" }));

    const useCase = new GetPeopleKpisUseCase(employees, documents, categories);
    const result = await useCase.execute(ORG);

    expect(result.priorityPendencies.some((p) => p.kind === "missing_document")).toBe(true);
  });

  it("agrupa colaboradores com a mesma pendência num único grupo, com etiqueta amigável da categoria", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const categories = new FakeDocumentCategoryRepository();
    const e1 = Employee.create({ fullName: "Kleiton Carlos" });
    const e2 = Employee.create({ fullName: "Alexandre Jesus" });
    employees.seed(ORG, e1);
    employees.seed(ORG, e2);

    const useCase = new GetPeopleKpisUseCase(employees, documents, categories);
    const result = await useCase.execute(ORG);

    const contractGroup = result.priorityPendencies.find(
      (p) => p.kind === "missing_document" && p.detail === "Contrato de trabalho em falta",
    );
    expect(contractGroup).toBeDefined();
    expect(contractGroup!.employees.map((e) => e.employeeName).sort()).toEqual(["Alexandre Jesus", "Kleiton Carlos"]);
  });

  it("documento a expirar gera pendência expiring_document", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const categories = new FakeDocumentCategoryRepository();
    const e = Employee.create({ fullName: "Andres" });
    employees.seed(ORG, e);
    const soon = new Date();
    soon.setDate(soon.getDate() + 5);
    documents.seed(
      ORG,
      EmployeeDocument.createFirstVersion({
        owner: { type: "employee", id: e.id },
        category: "cartao_cidadao",
        mandatory: true,
        fileName: "cc.pdf",
        storagePath: "x/cc.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 10,
        origin: "rh",
        expiresAt: soon.toISOString().slice(0, 10),
        uploadedBy: "rh@angrybox.com",
      }),
    );

    const useCase = new GetPeopleKpisUseCase(employees, documents, categories);
    const result = await useCase.execute(ORG);

    const group = result.priorityPendencies.find((p) => p.kind === "expiring_document");
    expect(group).toBeDefined();
    expect(group!.detail).toBe("Cartão de Cidadão a expirar");
    expect(group!.employees).toEqual([
      { employeeId: e.id, employeeName: "Andres", expiresAt: soon.toISOString().slice(0, 10) },
    ]);
  });

  it("nunca gera missing_document para categorias opcionais (só obrigatórias)", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const categories = new FakeDocumentCategoryRepository();
    employees.seed(ORG, Employee.create({ fullName: "Sem Docs Opcionais" }));

    const useCase = new GetPeopleKpisUseCase(employees, documents, categories);
    const result = await useCase.execute(ORG);

    const optionalPendency = result.priorityPendencies.find(
      (p) => p.kind === "missing_document" && p.detail.includes("Certificado de morada"),
    );
    expect(optionalPendency).toBeUndefined();
  });
});
