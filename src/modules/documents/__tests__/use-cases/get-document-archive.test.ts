import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Document } from "../../domain/entities/document.js";
import { GetDocumentArchiveUseCase } from "../../application/use-cases/get-document-archive.use-case.js";
import { FakeEmployeeDirectory, employee } from "../fakes/fake-employee-directory.js";
import { FakeDocumentRepository } from "../fakes/fake-document-repository.js";
import { FakeDocumentCategoryRepository } from "../fakes/fake-document-category-repository.js";

const ORG = mintOrganizationId("org-test");

const doc = (ownerId: string, category: string, period: string | null = null) =>
  Document.createFirstVersion({
    owner: { type: "employee", id: ownerId },
    category,
    mandatory: false,
    fileName: `${category}.pdf`,
    storagePath: `x/${category}.pdf`,
    mimeType: "application/pdf",
    fileSizeBytes: 10,
    origin: "rh",
    expiresAt: null,
    period,
    uploadedBy: "rh@demo.invalid",
  });

describe("GetDocumentArchiveUseCase", () => {
  it("conta os documentos atuais por colaborador × categoria e guarda o último arquivamento", async () => {
    const employees = new FakeEmployeeDirectory();
    const documents = new FakeDocumentRepository();
    const categories = new FakeDocumentCategoryRepository();
    const ana = employee({ fullName: "Ana Teste" });
    const rui = employee({ fullName: "Rui Teste" });
    employees.seed(ORG, ana);
    employees.seed(ORG, rui);
    employees.seed(ORG, employee({ fullName: "Inativo Teste" }).deactivate());
    documents.seed(ORG, doc(ana.id, "cartao_cidadao"));
    documents.seed(ORG, doc(ana.id, "recibo_vencimento", "2026-08"));
    documents.seed(ORG, doc(ana.id, "recibo_vencimento", "2026-09"));
    documents.seed(ORG, doc(rui.id, "contrato_trabalho").remove());

    const rows = await new GetDocumentArchiveUseCase(employees, documents, categories).execute({ organizationId: ORG });

    expect(rows.map((r) => [r.employeeName, r.category, r.count])).toEqual([
      ["Ana Teste", "cartao_cidadao", 1],
      ["Ana Teste", "recibo_vencimento", 2],
    ]);
    expect(rows.every((r) => typeof r.lastUploadedAt === "string")).toBe(true);
  });

  it("sem colaboradores ativos devolve vazio", async () => {
    const rows = await new GetDocumentArchiveUseCase(new FakeEmployeeDirectory(), new FakeDocumentRepository(), new FakeDocumentCategoryRepository()).execute({ organizationId: ORG });
    expect(rows).toEqual([]);
  });
});
