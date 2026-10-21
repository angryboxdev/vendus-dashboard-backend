import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Document } from "../../domain/entities/document.js";
import { EmployeeNotFoundError } from "../../domain/errors.js";
import { GetEmployeeDocumentSummaryUseCase } from "../../application/use-cases/get-employee-document-summary.use-case.js";
import { FakeDocumentRepository } from "../fakes/fake-document-repository.js";
import { FakeDocumentCategoryRepository } from "../fakes/fake-document-category-repository.js";
import { FakeEmployeeDirectory, employee } from "../fakes/fake-employee-directory.js";

const ORG = mintOrganizationId("org-test");

const doc = (ownerId: string, category: string, expiresAt: string | null) =>
  Document.createFirstVersion({
    owner: { type: "employee", id: ownerId },
    category,
    mandatory: true,
    fileName: `${category}.pdf`,
    storagePath: `x/${category}.pdf`,
    mimeType: "application/pdf",
    fileSizeBytes: 10,
    origin: "rh",
    expiresAt,
    period: null,
    uploadedBy: "rh@example.com",
  });

function setup() {
  const employees = new FakeEmployeeDirectory();
  const documents = new FakeDocumentRepository();
  const uc = new GetEmployeeDocumentSummaryUseCase(employees, documents, new FakeDocumentCategoryRepository());
  return { employees, documents, uc };
}

describe("GetEmployeeDocumentSummaryUseCase (ficha do Novo RH)", () => {
  it("sem documentos: obrigatórios em falta viram alertas", async () => {
    const { employees, uc } = setup();
    const ana = employee({ fullName: "Ana Teste" });
    employees.seed(ORG, ana);
    const s = await uc.execute({ organizationId: ORG, employeeId: ana.id });
    expect(s.mandatoryCompleted).toBe(0);
    expect(s.missingRequirements.length).toBe(s.mandatoryTotal);
    expect(s.alerts.map((a) => a.type)).toEqual(s.missingRequirements.map(() => "document_missing"));
  });

  it("documento a expirar conta e gera alerta", async () => {
    const { employees, documents, uc } = setup();
    const ana = employee({ fullName: "Ana Teste" });
    employees.seed(ORG, ana);
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    documents.seed(ORG, doc(ana.id, "cartao_cidadao", soon));
    const s = await uc.execute({ organizationId: ORG, employeeId: ana.id });
    expect(s.expiringSoonCount).toBe(1);
    expect(s.alerts).toContainEqual({ type: "document_expiring", message: "Cartão de Cidadão expira em breve" });
  });

  it("inativo: sem pendências nem alertas", async () => {
    const { employees, uc } = setup();
    const rui = employee({ fullName: "Rui Teste" }).deactivate();
    employees.seed(ORG, rui);
    const s = await uc.execute({ organizationId: ORG, employeeId: rui.id });
    expect(s).toMatchObject({ mandatoryCompleted: s.mandatoryTotal, missingRequirements: [], missingOptional: [], expiringSoonCount: 0, alerts: [] });
  });

  it("colaborador inexistente → EmployeeNotFoundError", async () => {
    await expect(setup().uc.execute({ organizationId: ORG, employeeId: "x" })).rejects.toBeInstanceOf(EmployeeNotFoundError);
  });
});
