import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { Document as EmployeeDocument } from "../../../documents/domain/entities/document.js";
import { DocumentCategoryDefinition } from "../../../documents/domain/entities/document-category.js";
import { GetDocumentOverviewUseCase } from "../../application/use-cases/get-document-overview.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeDocumentRepository } from "../../../documents/__tests__/fakes/fake-document-repository.js";
import { FakeDocumentCategoryRepository } from "../../../documents/__tests__/fakes/fake-document-category-repository.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const employees = new FakeEmployeeRepository();
  const documents = new FakeDocumentRepository();
  const categories = new FakeDocumentCategoryRepository();
  return { employees, documents, categories, useCase: new GetDocumentOverviewUseCase(employees, documents, categories) };
}

describe("GetDocumentOverviewUseCase", () => {
  it("1 linha por requisito obrigatório aplicável, mesmo sem documento; opcionais sem documento não são 'Em falta' (ticket 09)", async () => {
    const { employees, useCase } = makeUseCase();
    const e = Employee.create({ fullName: "Sem Documentos" });
    employees.seed(ORG, e);

    const rows = await useCase.execute({ organizationId: ORG });

    expect(rows.every((r) => r.employeeId === e.id)).toBe(true);
    expect(rows.every((r) => r.employeeName === "Sem Documentos")).toBe(true);
    // identificação + 3 categorias obrigatórias por omissão (ver FakeDocumentCategoryRepository) = 4;
    // as 5 opcionais sem documento já não aparecem.
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.status === "missing" && r.mandatory)).toBe(true);
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
        owner: { type: "employee", id: e.id },
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

  it("recibos (categoria periódica, ticket 10): uma linha por período, nunca 'Em falta'", async () => {
    const { employees, documents, useCase } = makeUseCase();
    const e = Employee.create({ fullName: "Com Recibos" });
    const sem = Employee.create({ fullName: "Sem Recibos" });
    employees.seed(ORG, e);
    employees.seed(ORG, sem);
    for (const period of ["2026-08", "2026-09"]) {
      documents.seed(
        ORG,
        EmployeeDocument.createFirstVersion({
          owner: { type: "employee", id: e.id },
          category: "recibo_vencimento",
          mandatory: false,
          fileName: `recibo-${period}.pdf`,
          storagePath: `x/recibo-${period}.pdf`,
          mimeType: "application/pdf",
          fileSizeBytes: 10,
          origin: "rh",
          expiresAt: null,
          period,
          uploadedBy: "rh@angrybox.com",
        }),
      );
    }

    const rows = (await useCase.execute({ organizationId: ORG })).filter((r) => r.requirementId === "recibo_vencimento");

    expect(rows.map((r) => [r.employeeName, r.period, r.status])).toEqual([
      ["Com Recibos", "2026-09", "ok"],
      ["Com Recibos", "2026-08", "ok"],
    ]);
    expect(rows.every((r) => r.requirementLabel === "Recibo de vencimento" && !r.mandatory)).toBe(true);
  });

});

describe("Ticket 09 — obrigatoriedade por Cargo e opcionais", () => {
  it("categoria obrigatória para 'Cargos selecionados' só gera pendência a quem tem esse cargo", async () => {
    const { employees, categories, useCase } = makeUseCase();
    const gerente = Employee.create({ fullName: "Gerente", positionId: "pos-gerente" });
    const outro = Employee.create({ fullName: "Outro", positionId: "pos-prep" });
    employees.seed(ORG, gerente);
    employees.seed(ORG, outro);
    await categories.create(
      ORG,
      DocumentCategoryDefinition.create({
        organizationId: String(ORG),
        slug: "curso_gerente",
        label: "Curso de gerente",
        mandatory: true,
        positionIds: ["pos-gerente"],
        acceptedMimeTypes: [],
      }),
    );

    const rows = await useCase.execute({ organizationId: ORG });

    expect(rows.some((r) => r.employeeId === gerente.id && r.requirementId === "curso_gerente")).toBe(true);
    expect(rows.some((r) => r.employeeId === outro.id && r.requirementId === "curso_gerente")).toBe(false);
  });

  it("categoria opcional com documento aparece (para acompanhar a validade)", async () => {
    const { employees, documents, useCase } = makeUseCase();
    const e = Employee.create({ fullName: "Com Certificado" });
    employees.seed(ORG, e);
    documents.seed(
      ORG,
      EmployeeDocument.createFirstVersion({
        owner: { type: "employee", id: e.id },
        category: "certificado_morada",
        mandatory: false,
        fileName: "morada.pdf",
        storagePath: "x",
        mimeType: "application/pdf",
        fileSizeBytes: 1,
        origin: "rh",
        expiresAt: "2099-01-01",
        uploadedBy: "rh",
      }),
    );

    const rows = await useCase.execute({ organizationId: ORG });

    expect(rows.find((r) => r.requirementId === "certificado_morada")).toMatchObject({ status: "ok", mandatory: false });
  });
});

describe("Base Organizacional — documento empresarial (teste crítico)", () => {
  it("uma categoria só da Empresa nunca aparece como requisito/'Em falta' dos colaboradores", async () => {
    const { employees, categories, useCase } = makeUseCase();
    employees.seed(ORG, Employee.create({ fullName: "Colaborador" }));
    await categories.create(
      ORG,
      DocumentCategoryDefinition.create({
        organizationId: ORG,
        slug: "apolice_empresa",
        label: "Apólice da empresa",
        mandatory: true,
        acceptedMimeTypes: [],
        scope: "company",
      }),
    );

    const rows = await useCase.execute({ organizationId: ORG });

    expect(rows.some((r) => r.requirementLabel === "Apólice da empresa")).toBe(false);
  });

  it("um documento da Empresa nunca conta como documento de nenhum colaborador", async () => {
    const { employees, documents, useCase } = makeUseCase();
    const e = Employee.create({ fullName: "Colaborador" });
    employees.seed(ORG, e);
    documents.seed(
      ORG,
      EmployeeDocument.createFirstVersion({
        owner: { type: "company", id: ORG },
        category: "contrato_trabalho",
        mandatory: false,
        fileName: "x.pdf",
        storagePath: "x.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1,
        origin: "rh",
        expiresAt: null,
        uploadedBy: "a",
      }),
    );

    const rows = await useCase.execute({ organizationId: ORG });

    expect(rows.find((r) => r.requirementLabel === "Contrato de trabalho")?.status).toBe("missing");
  });
});
