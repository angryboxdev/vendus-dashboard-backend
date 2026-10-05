import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { Document as EmployeeDocument } from "../../../documents/domain/entities/document.js";
import { ListEmployeesUseCase } from "../../application/use-cases/list-employees.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeDocumentRepository } from "../../../documents/__tests__/fakes/fake-document-repository.js";
import { FakeHrFileStorage } from "../fakes/fake-hr-file-storage.js";
import { FakeDocumentCategoryRepository } from "../../../documents/__tests__/fakes/fake-document-category-repository.js";

const ORG = mintOrganizationId("org-test");

describe("ListEmployeesUseCase", () => {
  it("devolve linhas com situação documental 'missing' quando falta um documento obrigatório", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const storage = new FakeHrFileStorage();
    const categories = new FakeDocumentCategoryRepository();
    const e = Employee.create({ fullName: "Andres Silva" });
    employees.seed(ORG, e);

    const useCase = new ListEmployeesUseCase(employees, documents, storage, categories);
    const result = await useCase.execute({ organizationId: ORG, viewerRole: "manager", page: 1, pageSize: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.documentSituation).toBe("missing");
    expect(result.total).toBe(1);
  });

  it("filtra por documentSituation em memória, ajustando o total", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const storage = new FakeHrFileStorage();
    const categories = new FakeDocumentCategoryRepository();
    employees.seed(ORG, Employee.create({ fullName: "Falta Documentos" }));
    employees.seed(ORG, Employee.create({ fullName: "Com Documentos" }));

    const useCase = new ListEmployeesUseCase(employees, documents, storage, categories);
    const result = await useCase.execute({
      organizationId: ORG,
      viewerRole: "manager",
      documentSituation: "missing",
      page: 1,
      pageSize: 10,
    });

    expect(result.total).toBe(2);
    expect(result.items.every((r) => r.documentSituation === "missing")).toBe(true);
  });

  it("pagina em memória (page/pageSize)", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const storage = new FakeHrFileStorage();
    const categories = new FakeDocumentCategoryRepository();
    for (const name of ["Ana", "Bruno", "Carlos"]) {
      employees.seed(ORG, Employee.create({ fullName: name }));
    }

    const useCase = new ListEmployeesUseCase(employees, documents, storage, categories);
    const page1 = await useCase.execute({ organizationId: ORG, viewerRole: "manager", page: 1, pageSize: 2 });
    const page2 = await useCase.execute({ organizationId: ORG, viewerRole: "manager", page: 2, pageSize: 2 });

    expect(page1.items.map((r) => r.fullName)).toEqual(["Ana", "Bruno"]);
    expect(page2.items.map((r) => r.fullName)).toEqual(["Carlos"]);
    expect(page1.total).toBe(3);
  });

  it("gera photoUrl assinado quando o colaborador tem foto", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const storage = new FakeHrFileStorage();
    const categories = new FakeDocumentCategoryRepository();
    const e = Employee.create({ fullName: "Andres Silva" }).updatePhoto("org-a/andres.jpg");
    employees.seed(ORG, e);

    const useCase = new ListEmployeesUseCase(employees, documents, storage, categories);
    const result = await useCase.execute({ organizationId: ORG, viewerRole: "manager", page: 1, pageSize: 10 });

    expect(result.items[0]!.photoUrl).toContain("org-a/andres.jpg");
  });

  it("filtra por profileComplete", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const storage = new FakeHrFileStorage();
    const categories = new FakeDocumentCategoryRepository();
    employees.seed(ORG, Employee.create({ fullName: "Perfil Incompleto" }));
    employees.seed(
      ORG,
      Employee.create({
        fullName: "Perfil Completo",
        email: "a@b.com",
        phone: "919000000",
        nif: "123456789",
        iban: "PT50",
        address: "Rua X",
        birthDate: "1990-01-01",
        socialSecurityNumber: "12345678901",
        idCardNumber: "12345678",
        nationality: "Portuguesa",
        hiredAt: "2024-01-01",
        emergencyContactName: "Y",
        emergencyContactPhone: "912345678",
      }),
    );

    const useCase = new ListEmployeesUseCase(employees, documents, storage, categories);
    const incomplete = await useCase.execute({
      organizationId: ORG,
      viewerRole: "manager",
      profileComplete: "incomplete",
      page: 1,
      pageSize: 10,
    });
    expect(incomplete.items.map((i) => i.fullName)).toEqual(["Perfil Incompleto"]);

    const complete = await useCase.execute({
      organizationId: ORG,
      viewerRole: "manager",
      profileComplete: "complete",
      page: 1,
      pageSize: 10,
    });
    expect(complete.items.map((i) => i.fullName)).toEqual(["Perfil Completo"]);
  });

  it("'ok' quando todas as categorias obrigatórias existem e nada expira em breve", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const storage = new FakeHrFileStorage();
    const categories = new FakeDocumentCategoryRepository();
    const e = Employee.create({ fullName: "Completo" });
    employees.seed(ORG, e);

    // Cumpre os 4 requisitos obrigatórios atuais (contrato, identificação — só
    // uma das três categorias aceites —, IBAN, seguro AT).
    const requiredCategories = ["contrato_trabalho", "cartao_cidadao", "comprovativo_iban", "apolice_seguro_at"];
    for (const category of requiredCategories) {
      documents.seed(
        ORG,
        EmployeeDocument.createFirstVersion({
          owner: { type: "employee", id: e.id },
          category,
          mandatory: true,
          fileName: `${category}.pdf`,
          storagePath: `x/${category}.pdf`,
          mimeType: "application/pdf",
          fileSizeBytes: 10,
          origin: "rh",
          expiresAt: null,
          uploadedBy: "rh@angrybox.com",
        }),
      );
    }

    const useCase = new ListEmployeesUseCase(employees, documents, storage, categories);
    const result = await useCase.execute({ organizationId: ORG, viewerRole: "manager", page: 1, pageSize: 10 });

    expect(result.items[0]!.documentSituation).toBe("ok");
  });

  it("colaborador inativo nunca mostra situação documental ou de perfil como pendente", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const storage = new FakeHrFileStorage();
    const categories = new FakeDocumentCategoryRepository();
    const e = Employee.create({ fullName: "Ex-Colaborador" }).deactivate();
    employees.seed(ORG, e);

    const useCase = new ListEmployeesUseCase(employees, documents, storage, categories);
    const result = await useCase.execute({
      organizationId: ORG,
      viewerRole: "manager",
      status: "all",
      page: 1,
      pageSize: 10,
    });

    expect(result.items[0]!.documentSituation).toBe("ok");
    expect(result.items[0]!.profileCompletionPercent).toBe(100);
  });

  it("filtro profileComplete=incomplete nunca inclui colaboradores inativos", async () => {
    const employees = new FakeEmployeeRepository();
    const documents = new FakeDocumentRepository();
    const storage = new FakeHrFileStorage();
    const categories = new FakeDocumentCategoryRepository();
    employees.seed(ORG, Employee.create({ fullName: "Inativo Incompleto" }).deactivate());
    employees.seed(ORG, Employee.create({ fullName: "Ativo Incompleto" }));

    const useCase = new ListEmployeesUseCase(employees, documents, storage, categories);
    const result = await useCase.execute({
      organizationId: ORG,
      viewerRole: "manager",
      status: "all",
      profileComplete: "incomplete",
      page: 1,
      pageSize: 10,
    });

    expect(result.items.map((i) => i.fullName)).toEqual(["Ativo Incompleto"]);
  });
});
