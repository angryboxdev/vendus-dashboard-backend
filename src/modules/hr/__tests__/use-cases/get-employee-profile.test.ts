import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { GetEmployeeProfileUseCase } from "../../application/use-cases/get-employee-profile.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeDocumentRepository } from "../../../documents/__tests__/fakes/fake-document-repository.js";
import { FakeHrFileStorage } from "../fakes/fake-hr-file-storage.js";
import { FakeDocumentCategoryRepository } from "../../../documents/__tests__/fakes/fake-document-category-repository.js";
import { EmployeeNotFoundError } from "../../domain/errors.js";

const ORG = mintOrganizationId("org-test");

describe("GetEmployeeProfileUseCase", () => {
  it("lança EmployeeNotFoundError para id inexistente", async () => {
    const useCase = new GetEmployeeProfileUseCase(
      new FakeEmployeeRepository(),
      new FakeDocumentRepository(),
      new FakeHrFileStorage(),
      new FakeDocumentCategoryRepository(),
    );
    await expect(
      useCase.execute({ organizationId: ORG, viewerRole: "manager", id: "inexistente" }),
    ).rejects.toThrow(EmployeeNotFoundError);
  });

  it("mascara IBAN/NIF/NISS/nº doc. identificação para hr_viewer, mas não para manager", async () => {
    const employees = new FakeEmployeeRepository();
    const e = Employee.create({
      fullName: "Andres Silva",
      iban: "PT50000201231234567890154",
      nif: "271234567",
    });
    employees.seed(ORG, e);

    const useCase = new GetEmployeeProfileUseCase(
      employees,
      new FakeDocumentRepository(),
      new FakeHrFileStorage(),
      new FakeDocumentCategoryRepository(),
    );

    const asViewer = await useCase.execute({ organizationId: ORG, viewerRole: "hr_viewer", id: e.id });
    expect(asViewer.employee.iban).toBe("*********************0154");
    expect(asViewer.employee.nif).toBe("*****4567");

    const asManager = await useCase.execute({ organizationId: ORG, viewerRole: "manager", id: e.id });
    expect(asManager.employee.iban).toBe("PT50000201231234567890154");
    expect(asManager.employee.nif).toBe("271234567");
  });

  it("alerta de documento em falta quando falta um documento obrigatório (sem estado de onboarding — removido na Base Organizacional)", async () => {
    const employees = new FakeEmployeeRepository();
    const e = Employee.create({ fullName: "Andres Silva" });
    employees.seed(ORG, e);

    const useCase = new GetEmployeeProfileUseCase(
      employees,
      new FakeDocumentRepository(),
      new FakeHrFileStorage(),
      new FakeDocumentCategoryRepository(),
    );
    const result = await useCase.execute({ organizationId: ORG, viewerRole: "manager", id: e.id });

    expect(result).not.toHaveProperty("onboardingStatus");
    expect(result.alerts.some((a) => a.type === "document_missing")).toBe(true);
  });

  it("alerta de contacto de emergência pendente quando não preenchido", async () => {
    const employees = new FakeEmployeeRepository();
    const e = Employee.create({ fullName: "Andres Silva" });
    employees.seed(ORG, e);

    const useCase = new GetEmployeeProfileUseCase(
      employees,
      new FakeDocumentRepository(),
      new FakeHrFileStorage(),
      new FakeDocumentCategoryRepository(),
    );
    const result = await useCase.execute({ organizationId: ORG, viewerRole: "manager", id: e.id });

    expect(result.alerts.some((a) => a.type === "emergency_contact_pending")).toBe(true);
  });

  it("colaborador inativo não gera alertas de documentos/perfil", async () => {
    const employees = new FakeEmployeeRepository();
    const e = Employee.create({ fullName: "Ex-Colaborador" }).deactivate();
    employees.seed(ORG, e);

    const useCase = new GetEmployeeProfileUseCase(
      employees,
      new FakeDocumentRepository(),
      new FakeHrFileStorage(),
      new FakeDocumentCategoryRepository(),
    );
    const result = await useCase.execute({ organizationId: ORG, viewerRole: "manager", id: e.id });

    expect(result.alerts).toEqual([]);
    expect(result.profileCompletionPercent).toBe(100);
    expect(result.documents.missingRequirements).toEqual([]);
    expect(result.documents.mandatoryCompleted).toBe(result.documents.mandatoryTotal);
    expect(Object.values(result.sections).every(Boolean)).toBe(true);
  });

  it("categorias opcionais em falta aparecem em missingOptional, nunca em missingRequirements", async () => {
    const employees = new FakeEmployeeRepository();
    const e = Employee.create({ fullName: "Andres Silva" });
    employees.seed(ORG, e);

    const useCase = new GetEmployeeProfileUseCase(
      employees,
      new FakeDocumentRepository(),
      new FakeHrFileStorage(),
      new FakeDocumentCategoryRepository(),
    );
    const result = await useCase.execute({ organizationId: ORG, viewerRole: "manager", id: e.id });

    expect(result.documents.missingOptional).toContain("Certificado de morada");
    expect(result.documents.missingRequirements).not.toContain("Certificado de morada");
  });

  it("categoria desativada deixa de contar como obrigatória em falta", async () => {
    const employees = new FakeEmployeeRepository();
    const e = Employee.create({ fullName: "Andres Silva" });
    employees.seed(ORG, e);
    const categories = new FakeDocumentCategoryRepository();
    const seeded = await categories.findMany(ORG);
    const contrato = seeded.find((c) => c.slug === "contrato_trabalho")!;
    categories.seedOverride(ORG, [
      ...seeded.filter((c) => c.slug !== "contrato_trabalho"),
      contrato.setActive(false),
    ]);

    const useCase = new GetEmployeeProfileUseCase(
      employees,
      new FakeDocumentRepository(),
      new FakeHrFileStorage(),
      categories,
    );
    const result = await useCase.execute({ organizationId: ORG, viewerRole: "manager", id: e.id });

    expect(result.documents.missingRequirements).not.toContain("Contrato de trabalho");
  });
});
