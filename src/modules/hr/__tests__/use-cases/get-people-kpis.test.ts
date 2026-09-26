import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { GetPeopleKpisUseCase } from "../../application/use-cases/get-people-kpis.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeEmployeeDocumentRepository } from "../fakes/fake-employee-document-repository.js";

const ORG = mintOrganizationId("org-test");

describe("GetPeopleKpisUseCase", () => {
  it("conta activeEmployees só entre os ativos", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeEmployeeDocumentRepository();
    employees.seed(ORG, Employee.create({ fullName: "Ativo" }));
    employees.seed(ORG, Employee.create({ fullName: "Inativo" }).deactivate());

    const useCase = new GetPeopleKpisUseCase(employees, documents);
    const result = await useCase.execute(ORG);

    expect(result.activeEmployees).toBe(1);
  });

  it("perfil incompleto gera incompleteProfiles + pendência prioritária", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeEmployeeDocumentRepository();
    employees.seed(ORG, Employee.create({ fullName: "Incompleto" }));

    const useCase = new GetPeopleKpisUseCase(employees, documents);
    const result = await useCase.execute(ORG);

    expect(result.incompleteProfiles).toBe(1);
    expect(result.priorityPendencies.some((p) => p.kind === "missing_field")).toBe(true);
  });

  it("contacto de emergência em falta gera pendência prioritária dedicada", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeEmployeeDocumentRepository();
    employees.seed(ORG, Employee.create({ fullName: "Sem Contacto" }));

    const useCase = new GetPeopleKpisUseCase(employees, documents);
    const result = await useCase.execute(ORG);

    expect(result.priorityPendencies.some((p) => p.detail.includes("emergência"))).toBe(true);
  });

  it("documento obrigatório em falta gera missing_document", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeEmployeeDocumentRepository();
    employees.seed(ORG, Employee.create({ fullName: "Sem Docs" }));

    const useCase = new GetPeopleKpisUseCase(employees, documents);
    const result = await useCase.execute(ORG);

    expect(result.priorityPendencies.some((p) => p.kind === "missing_document")).toBe(true);
  });
});
