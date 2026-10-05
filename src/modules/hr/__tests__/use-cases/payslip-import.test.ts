import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { UploadEmployeeDocumentUseCase } from "../../application/use-cases/upload-employee-document.use-case.js";
import { ReplaceEmployeeDocumentUseCase } from "../../application/use-cases/replace-employee-document.use-case.js";
import { ImportPayslipsUseCase, PreviewPayslipImportUseCase } from "../../application/use-cases/payslip-import.use-cases.js";
import { InvalidDocumentError } from "../../domain/errors.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrFileStorage } from "../fakes/fake-hr-file-storage.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakePdfTextExtractor } from "../fakes/fake-pdf-text-extractor.js";
import { FakeDocumentRepository } from "../../../documents/__tests__/fakes/fake-document-repository.js";
import { FakeDocumentCategoryRepository } from "../../../documents/__tests__/fakes/fake-document-category-repository.js";

const ORG = mintOrganizationId("org-test");
const PERIOD = "2026-09";
const ACTOR = "admin@exemplo.pt";
const pdf = (text: string) => ({ buffer: Buffer.from(text), mimeType: "application/pdf" });

function setup() {
  const employees = new FakeEmployeeRepository();
  const documents = new FakeDocumentRepository();
  const categories = new FakeDocumentCategoryRepository();
  const storage = new FakeHrFileStorage();
  const auditLog = new FakeHrAuditLog();
  const upload = new UploadEmployeeDocumentUseCase(employees, documents, storage, auditLog, categories);
  const replace = new ReplaceEmployeeDocumentUseCase(employees, documents, storage, auditLog);
  // Dados fictícios (RGPD).
  const carlos = Employee.create({ fullName: "Carlos Andrés", nif: "100000001" });
  const gabriel = Employee.create({ fullName: "Gabriel Gomes", nif: "100000002" });
  employees.seed(ORG, carlos);
  employees.seed(ORG, gabriel);
  return {
    documents,
    auditLog,
    carlos,
    gabriel,
    preview: new PreviewPayslipImportUseCase(employees, documents, categories, new FakePdfTextExtractor()),
    importer: new ImportPayslipsUseCase(documents, categories, upload, replace),
  };
}

async function payslipsOf(documents: FakeDocumentRepository, employeeId: string) {
  return (await documents.findCurrentByOwners(ORG, "employee", [employeeId])).filter((d) => d.category === "recibo_vencimento");
}

describe("Importação de recibos — pré-visualização", () => {
  it("identifica pelo texto e pelo nome do ficheiro; ficheiro sem pistas fica em Rever (sem associação)", async () => {
    const { preview, carlos, gabriel } = setup();
    const rows = await preview.execute({
      organizationId: ORG,
      period: PERIOD,
      files: [
        { fileName: "carlos.pdf", ...pdf("") },
        { fileName: "recibo-001.pdf", ...pdf("Nome: Gabriel Gomes\nNIF 100000002") },
        { fileName: "doc123.pdf", ...pdf("") },
      ],
    });
    expect(rows.map((r) => [r.fileName, r.status, r.employeeId])).toEqual([
      ["carlos.pdf", "identified", carlos.id],
      ["recibo-001.pdf", "identified", gabriel.id],
      ["doc123.pdf", "review", null],
    ]);
    expect(rows[2]).toMatchObject({ reviewReason: "no_match", employeeName: null, hasText: false });
  });

  it("recibo já existente no período aparece como duplicado, com o documento atual", async () => {
    const { preview, importer, carlos } = setup();
    const [created] = await importer.execute({
      organizationId: ORG,
      actor: ACTOR,
      period: PERIOD,
      items: [{ fileName: "carlos.pdf", ...pdf(""), employeeId: carlos.id, action: "create" }],
    });
    const [row] = await preview.execute({ organizationId: ORG, period: PERIOD, files: [{ fileName: "carlos.pdf", ...pdf("") }] });
    expect(row).toMatchObject({ status: "duplicate", employeeId: carlos.id, existingDocumentId: created!.documentId });
    // Noutro período não é duplicado.
    const [other] = await preview.execute({ organizationId: ORG, period: "2026-10", files: [{ fileName: "carlos.pdf", ...pdf("") }] });
    expect(other!.status).toBe("identified");
  });

  it("dois ficheiros do lote para o mesmo colaborador → ambos em Rever", async () => {
    const { preview, carlos } = setup();
    const rows = await preview.execute({
      organizationId: ORG,
      period: PERIOD,
      files: [
        { fileName: "carlos.pdf", ...pdf("") },
        { fileName: "carlos-andres.pdf", ...pdf("") },
      ],
    });
    expect(rows.map((r) => r.status)).toEqual(["review", "review"]);
    expect(rows[0]).toMatchObject({ reviewReason: "repeated_in_batch", candidates: [{ id: carlos.id, name: "Carlos Andrés" }] });
  });

  it("período inválido é recusado", async () => {
    const { preview } = setup();
    await expect(preview.execute({ organizationId: ORG, period: "09/2026", files: [{ fileName: "a.pdf", ...pdf("") }] })).rejects.toThrow(
      InvalidDocumentError,
    );
  });
});

describe("Importação de recibos — gravar", () => {
  it("recibo duplicado (Carlos / 09/2026): bloqueia a duplicação e permite substituir versão", async () => {
    const { importer, documents, carlos } = setup();
    const item = { fileName: "carlos.pdf", ...pdf(""), employeeId: carlos.id };
    await importer.execute({ organizationId: ORG, actor: ACTOR, period: PERIOD, items: [{ ...item, action: "create" }] });

    const [blocked] = await importer.execute({ organizationId: ORG, actor: ACTOR, period: PERIOD, items: [{ ...item, action: "create" }] });
    expect(blocked).toMatchObject({ outcome: "duplicate", message: "Já existe um recibo deste colaborador para este período." });
    expect(await payslipsOf(documents, carlos.id)).toHaveLength(1);

    const [replaced] = await importer.execute({
      organizationId: ORG,
      actor: ACTOR,
      period: PERIOD,
      items: [{ ...item, fileName: "carlos-corrigido.pdf", action: "replace" }],
    });
    expect(replaced!.outcome).toBe("replaced");
    const current = await payslipsOf(documents, carlos.id);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ version: 2, period: PERIOD, fileName: "carlos-corrigido.pdf" });
  });

  it("um recibo por colaborador e por período — meses diferentes coexistem; o lote partilha o histórico", async () => {
    const { importer, documents, auditLog, carlos, gabriel } = setup();
    const results = await importer.execute({
      organizationId: ORG,
      actor: ACTOR,
      period: PERIOD,
      items: [
        { fileName: "carlos.pdf", ...pdf(""), employeeId: carlos.id, action: "create" },
        { fileName: "gabriel.pdf", ...pdf(""), employeeId: gabriel.id, action: "create" },
      ],
    });
    expect(results.map((r) => r.outcome)).toEqual(["created", "created"]);
    await importer.execute({
      organizationId: ORG,
      actor: ACTOR,
      period: "2026-10",
      items: [{ fileName: "carlos.pdf", ...pdf(""), employeeId: carlos.id, action: "create" }],
    });
    expect((await payslipsOf(documents, carlos.id)).map((d) => d.period).sort()).toEqual(["2026-09", "2026-10"]);

    const batch = auditLog.entries.filter((e) => e.action === "document_created").slice(0, 2);
    expect(batch[0]!.correlationId).toBe(batch[1]!.correlationId);
    expect(batch[0]!.description).toContain("importação de recibos");
  });

  it("recusa o mesmo colaborador duas vezes no lote", async () => {
    const { importer, carlos } = setup();
    await expect(
      importer.execute({
        organizationId: ORG,
        actor: ACTOR,
        period: PERIOD,
        items: [
          { fileName: "a.pdf", ...pdf(""), employeeId: carlos.id, action: "create" },
          { fileName: "b.pdf", ...pdf(""), employeeId: carlos.id, action: "create" },
        ],
      }),
    ).rejects.toThrow(InvalidDocumentError);
  });
});
