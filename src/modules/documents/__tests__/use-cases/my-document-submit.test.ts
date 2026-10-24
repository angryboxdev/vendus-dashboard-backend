import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Document } from "../../domain/entities/document.js";
import { PortalBadRequestError, PortalNotLinkedError } from "../../domain/errors.js";
import { ListPendingDocumentsUseCase, ReplaceMyDocumentUseCase, ReviewEmployeeDocumentUseCase } from "../../application/use-cases/employee-document-review.use-cases.js";
import { GetMyDocumentChecklistUseCase, SubmitMyDocumentUseCase } from "../../application/use-cases/my-document-submit.use-cases.js";
import { FakeDocumentAuditLog } from "../fakes/fake-document-audit-log.js";
import { FakeDocumentCategoryRepository } from "../fakes/fake-document-category-repository.js";
import { FakeDocumentRepository } from "../fakes/fake-document-repository.js";
import { FakeEmployeeDirectory, employee } from "../fakes/fake-employee-directory.js";
import { FakeEmployeeFileStorage } from "../fakes/fake-employee-file-storage.js";

// Dados fictícios (RGPD).
const ORG = mintOrganizationId("org-test");
const TODAY = "2026-10-23";

function setup() {
  const employees = new FakeEmployeeDirectory();
  const documents = new FakeDocumentRepository();
  const categories = new FakeDocumentCategoryRepository();
  const storage = new FakeEmployeeFileStorage();
  const audit = new FakeDocumentAuditLog();
  const carla = employee({ fullName: "CARLA DEMO" });
  const outro = employee({ fullName: "OUTRO DEMO" });
  employees.seed(ORG, carla);
  employees.seed(ORG, outro);
  employees.links.set(carla.id, "u-carla");
  const who = { organizationId: ORG, userId: "u-carla", actor: "carla@example.com" };
  const today = () => TODAY;
  const replace = new ReplaceMyDocumentUseCase(employees, documents, categories, storage, audit, today);
  const submit = new SubmitMyDocumentUseCase(employees, documents, categories, storage, audit, replace, today);
  const checklist = new GetMyDocumentChecklistUseCase(employees, documents, categories, today);
  const file = (category: string, extra: Partial<{ mimeType: string; period: string; expiresAt: string }> = {}) => ({
    ...who,
    category,
    buffer: Buffer.from("x"),
    filename: `${category}.pdf`,
    mimeType: extra.mimeType ?? "application/pdf",
    period: extra.period ?? null,
    ...(extra.expiresAt ? { expiresAt: extra.expiresAt } : {}),
  });
  const rhDoc = (ownerId: string, category: string, expiresAt: string | null) =>
    Document.createFirstVersion({
      owner: { type: "employee", id: ownerId },
      category,
      mandatory: false,
      fileName: `${category}.pdf`,
      storagePath: `x/${category}.pdf`,
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      origin: "rh",
      expiresAt,
      uploadedBy: "rh@example.com",
    });
  return { employees, documents, categories, storage, audit, carla, outro, who, submit, checklist, file, rhDoc };
}

describe("Portal — submeter documento", () => {
  it("documento em falta: fica «Em validação», auditado, e aparece na caixa do RH", async () => {
    const { submit, documents, audit, carla, file, employees, categories } = setup();
    const saved = await submit.execute(file("nif"));
    expect(saved).toMatchObject({ category: "nif", categoryLabel: "NIF", status: "pending_validation" });
    expect((await documents.findCurrentByOwners(ORG, "employee", [carla.id]))[0]).toMatchObject({ origin: "colaborador", status: "pending_validation" });
    expect(audit.entries.at(-1)).toMatchObject({ action: "document_submitted", actor: "carla@example.com" });
    const pending = await new ListPendingDocumentsUseCase(documents, employees, categories).execute({ organizationId: ORG });
    expect(pending.map((p) => [p.employeeName, p.categoryLabel])).toEqual([["CARLA DEMO", "NIF"]]);
  });

  it("identificação (categoria fixa) com o nome amigável", async () => {
    const { submit, file } = setup();
    expect(await submit.execute(file("cartao_cidadao", { mimeType: "image/jpeg" }))).toMatchObject({ categoryLabel: "Cartão de Cidadão", status: "pending_validation" });
  });

  it("recusa: pasta da empresa, recibo de vencimento, formato, validade no passado e segundo envio em validação", async () => {
    const { submit, file } = setup();
    await expect(submit.execute(file("recibo_vencimento", { period: "2026-09" }))).rejects.toBeInstanceOf(PortalBadRequestError);
    await expect(submit.execute(file("inventada"))).rejects.toBeInstanceOf(PortalBadRequestError);
    await expect(submit.execute(file("nif", { mimeType: "application/zip" }))).rejects.toThrow(/Formato não aceite/);
    await expect(submit.execute(file("nif", { expiresAt: "2026-10-01" }))).rejects.toThrow(/validade/);
    await submit.execute(file("nif"));
    await expect(submit.execute(file("nif"))).rejects.toThrow(/em validação/);
  });

  it("documento válido não se substitui; vencido passa a nova versão (a anterior fica no histórico)", async () => {
    const { submit, documents, carla, file, rhDoc } = setup();
    documents.seed(ORG, rhDoc(carla.id, "nif", null));
    await expect(submit.execute(file("nif"))).rejects.toThrow(/está válido/);
    documents.seed(ORG, rhDoc(carla.id, "atestado_saude", "2026-01-31"));
    const saved = await submit.execute(file("atestado_saude"));
    expect(saved).toMatchObject({ status: "pending_validation" });
    const history = await documents.findVersionHistory(ORG, "employee", carla.id, "atestado_saude");
    expect(history.map((d) => d.version)).toEqual([2, 1]);
  });

  it("recibo verde (periódico, emitido pelo próprio): pede o mês e não repete o mesmo mês", async () => {
    const { submit, file } = setup();
    await expect(submit.execute(file("recibo_verde"))).rejects.toThrow(/mês/);
    expect(await submit.execute(file("recibo_verde", { period: "2026-09" }))).toMatchObject({ period: "2026-09", isPayslip: true });
    await expect(submit.execute(file("recibo_verde", { period: "2026-09" }))).rejects.toThrow(/deste mês/);
  });

  it("conta sem ficha → PortalNotLinkedError; o documento fica sempre no próprio", async () => {
    const { submit, file, documents, outro } = setup();
    await expect(submit.execute({ ...file("nif"), userId: "outra-conta" })).rejects.toBeInstanceOf(PortalNotLinkedError);
    await submit.execute(file("nif"));
    expect(await documents.findCurrentByOwners(ORG, "employee", [outro.id])).toEqual([]);
  });

  it("rejeitado pelo RH: volta a «em falta» com o motivo, e pode enviar outra vez", async () => {
    const { submit, checklist, documents, audit, carla, file } = setup();
    const sent = await submit.execute(file("comprovativo_iban"));
    await new ReviewEmployeeDocumentUseCase(documents, audit).execute({ organizationId: ORG, actor: "rh@example.com", employeeId: carla.id, documentId: sent.id, decision: "reject", note: "Ilegível" });
    const mine = await checklist.execute({ organizationId: ORG, userId: "u-carla", actor: "carla@example.com" });
    expect(mine.categories.find((c) => c.slug === "comprovativo_iban")).toMatchObject({ status: "missing", canSubmit: true, lastRejection: { note: "Ilegível" } });
    await expect(submit.execute(file("comprovativo_iban"))).resolves.toMatchObject({ status: "pending_validation" });
  });
});

describe("Portal — lista de verificação", () => {
  it("o que posso enviar, com o estado; obrigatórios em falta (em validação não conta); nunca o recibo de vencimento", async () => {
    const { checklist, submit, documents, carla, who, file, rhDoc } = setup();
    documents.seed(ORG, rhDoc(carla.id, "contrato_trabalho", null));
    documents.seed(ORG, rhDoc(carla.id, "apolice_seguro_at", "2026-01-31"));
    await submit.execute(file("comprovativo_iban"));
    const out = await checklist.execute(who);
    const bySlug = new Map(out.categories.map((c) => [c.slug, c]));
    expect(bySlug.get("contrato_trabalho")).toMatchObject({ status: "ok", canSubmit: false, mandatory: true });
    expect(bySlug.get("apolice_seguro_at")).toMatchObject({ status: "expired", canSubmit: true });
    expect(bySlug.get("comprovativo_iban")).toMatchObject({ status: "pending", canSubmit: false });
    expect(bySlug.get("cartao_cidadao")).toMatchObject({ status: "missing", canSubmit: true });
    expect(bySlug.get("recibo_verde")).toMatchObject({ requiresPeriod: true, status: null, canSubmit: true });
    expect(bySlug.has("recibo_vencimento")).toBe(false);
    expect(out.missingMandatory.map((m) => [m.label, m.status])).toEqual([
      ["Documento de identificação", "missing"],
      ["Apólice de seguro de acidentes de trabalho", "expired"],
    ]);
  });
});
