import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Document } from "../../domain/entities/document.js";
import { EmployeeDocumentNotFoundError, PortalNotLinkedError, PortalResourceNotFoundError } from "../../domain/errors.js";
import type { GetEmployeeDocumentDownloadUrlPort } from "../../domain/ports/in/employee-document.ports.js";
import { GetMyDocumentUrlUseCase, ListMyDocumentsUseCase } from "../../application/use-cases/my-documents.use-cases.js";
import { FakeDocumentRepository } from "../fakes/fake-document-repository.js";
import { FakeDocumentCategoryRepository } from "../fakes/fake-document-category-repository.js";
import { FakeEmployeeDirectory, employee } from "../fakes/fake-employee-directory.js";

const ORG = mintOrganizationId("org-test");

function setup() {
  const employees = new FakeEmployeeDirectory();
  const carla = employee({ fullName: "CARLA MARIA DEMO" });
  const gabriel = employee({ fullName: "gabriel souza teste" });
  employees.seed(ORG, carla);
  employees.seed(ORG, gabriel);
  employees.links.set(carla.id, "user-carla");
  const who = { organizationId: ORG, userId: "user-carla", actor: "carla@example.com" };
  return { employees, carla, gabriel, who };
}

describe("Portal — Documentos", () => {
  const doc = (ownerId: string, category: string, extra: Partial<{ period: string; expiresAt: string }> = {}) =>
    Document.createFirstVersion({
      owner: { type: "employee", id: ownerId },
      category,
      mandatory: false,
      fileName: `${category}.pdf`,
      storagePath: `x/${category}.pdf`,
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      origin: "rh",
      expiresAt: extra.expiresAt ?? null,
      period: extra.period ?? null,
      uploadedBy: "rh@example.com",
    });

  it("lista os atuais do próprio, sem removidos, recibos marcados e por período desc", async () => {
    const { employees, carla, gabriel, who } = setup();
    const documents = new FakeDocumentRepository();
    documents.seed(ORG, doc(carla.id, "recibo_vencimento", { period: "2026-08" }));
    documents.seed(ORG, doc(carla.id, "recibo_vencimento", { period: "2026-09" }));
    documents.seed(ORG, doc(carla.id, "nif"));
    documents.seed(ORG, doc(carla.id, "atestado_saude").remove());
    documents.seed(ORG, doc(gabriel.id, "nif"));
    const list = await new ListMyDocumentsUseCase(employees, documents, new FakeDocumentCategoryRepository()).execute(who);
    expect(list.map((d) => [d.categoryLabel, d.period, d.isPayslip])).toEqual([
      ["Recibo de vencimento", "2026-09", true],
      ["Recibo de vencimento", "2026-08", true],
      ["NIF", null, false],
    ]);
  });

  it("identificação com o nome amigável (nunca o código) e categoria/tipo para as pastas", async () => {
    const { employees, carla, who } = setup();
    const documents = new FakeDocumentRepository();
    documents.seed(ORG, doc(carla.id, "cartao_cidadao"));
    const [d] = await new ListMyDocumentsUseCase(employees, documents, new FakeDocumentCategoryRepository()).execute(who);
    expect(d).toMatchObject({ categoryLabel: "Cartão de Cidadão", category: "cartao_cidadao", mimeType: "application/pdf" });
  });

  it("conta sem ficha ligada → PortalNotLinkedError", async () => {
    const { employees } = setup();
    const uc = new ListMyDocumentsUseCase(employees, new FakeDocumentRepository(), new FakeDocumentCategoryRepository());
    await expect(uc.execute({ organizationId: ORG, userId: "outra-conta", actor: "x@example.com" })).rejects.toBeInstanceOf(PortalNotLinkedError);
  });

  it("download de documento de outro colaborador → 404 (nunca o URL)", async () => {
    const { employees, carla, who } = setup();
    const calls: unknown[] = [];
    const download: GetEmployeeDocumentDownloadUrlPort = {
      async execute(cmd) {
        calls.push(cmd);
        if (cmd.documentId !== "doc-carla") throw new EmployeeDocumentNotFoundError(cmd.documentId);
        return { url: "https://signed/doc-carla" };
      },
    };
    const uc = new GetMyDocumentUrlUseCase(employees, download);
    await expect(uc.execute(who, "doc-carla")).resolves.toEqual({ url: "https://signed/doc-carla" });
    await expect(uc.execute(who, "doc-gabriel")).rejects.toBeInstanceOf(PortalResourceNotFoundError);
    // O colaborador vem sempre da sessão.
    expect(calls).toEqual([
      { organizationId: ORG, employeeId: carla.id, documentId: "doc-carla" },
      { organizationId: ORG, employeeId: carla.id, documentId: "doc-gabriel" },
    ]);
  });
});
