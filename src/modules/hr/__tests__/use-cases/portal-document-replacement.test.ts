import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Document, DocumentNotPendingError, DocumentRejectionReasonRequiredError } from "../../../documents/domain/entities/document.js";
import { FakeDocumentRepository } from "../../../documents/__tests__/fakes/fake-document-repository.js";
import { FakeDocumentCategoryRepository } from "../../../documents/__tests__/fakes/fake-document-category-repository.js";
import { Employee } from "../../domain/entities/employee.js";
import { PortalBadRequestError, PortalResourceNotFoundError } from "../../domain/errors.js";
import {
  ListPendingDocumentsUseCase,
  ReplaceMyDocumentUseCase,
  ReviewEmployeeDocumentUseCase,
} from "../../application/use-cases/employee-document-review.use-cases.js";
import { ListMyDocumentsUseCase } from "../../application/use-cases/portal-self-service.use-cases.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakeHrFileStorage } from "../fakes/fake-hr-file-storage.js";
import { FakePortalAccount } from "../fakes/fake-portal-account.js";

const ORG = mintOrganizationId("org-test");
const TODAY = "2026-10-07";

function setup() {
  const accounts = new FakePortalAccount();
  const employees = new FakeEmployeeRepository();
  const documents = new FakeDocumentRepository();
  const categories = new FakeDocumentCategoryRepository();
  const storage = new FakeHrFileStorage();
  const audit = new FakeHrAuditLog();
  const carla = Employee.create({ fullName: "CARLA DEMO", email: "carla@example.com" });
  const outro = Employee.create({ fullName: "OUTRO DEMO" });
  employees.seed(ORG, carla);
  employees.seed(ORG, outro);
  accounts.seedAccount({ userId: "u-carla", email: "carla@example.com", role: "employee" });
  accounts.links.set(carla.id, "u-carla");
  const who = { organizationId: ORG, userId: "u-carla", actor: "carla@example.com" };
  const doc = (ownerId: string, category: string, expiresAt: string | null) => {
    const d = Document.createFirstVersion({
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
    documents.seed(ORG, d);
    return d;
  };
  const replace = new ReplaceMyDocumentUseCase(accounts, documents, categories, storage, audit, () => TODAY);
  const review = new ReviewEmployeeDocumentUseCase(documents, audit);
  const list = new ListMyDocumentsUseCase(accounts, documents, categories, () => TODAY);
  const file = { buffer: Buffer.from("pdf"), filename: "novo.pdf", mimeType: "application/pdf" };
  return { accounts, employees, documents, categories, audit, carla, outro, who, doc, replace, review, list, file };
}

describe("Portal — substituir documento (ticket 11)", () => {
  it("documento vencido: envio fica 'Em validação' e o anterior passa ao histórico", async () => {
    const { replace, documents, doc, carla, who, file, audit } = setup();
    const old = doc(carla.id, "atestado_saude", "2026-09-30");
    const dto = await replace.execute({ ...who, documentId: old.id, ...file, expiresAt: "2027-09-30" });
    expect(dto).toMatchObject({ status: "pending_validation", canReplace: false, expiresAt: "2027-09-30" });
    expect((await documents.findById(ORG, old.id))!.isCurrent).toBe(false);
    expect(audit.entries.at(-1)).toMatchObject({ action: "document_submitted", actor: "carla@example.com" });
  });

  it("a vencer em 30 dias pode; válido por mais tempo ou sem validade não pode", async () => {
    const { replace, doc, carla, who, file } = setup();
    await expect(replace.execute({ ...who, documentId: doc(carla.id, "nif", "2026-11-06").id, ...file })).resolves.toBeTruthy();
    await expect(replace.execute({ ...who, documentId: doc(carla.id, "formacao_seguranca", "2026-11-07").id, ...file })).rejects.toBeInstanceOf(PortalBadRequestError);
    await expect(replace.execute({ ...who, documentId: doc(carla.id, "certificado_morada", null).id, ...file })).rejects.toBeInstanceOf(PortalBadRequestError);
  });

  it("não envia duas vezes enquanto aguarda validação", async () => {
    const { replace, doc, carla, who, file } = setup();
    const sent = await replace.execute({ ...who, documentId: doc(carla.id, "atestado_saude", "2026-09-30").id, ...file });
    await expect(replace.execute({ ...who, documentId: sent.id, ...file })).rejects.toBeInstanceOf(PortalBadRequestError);
  });

  it("documento de outro colaborador → 404; formato não aceite → 400", async () => {
    const { replace, doc, carla, outro, who, file } = setup();
    await expect(replace.execute({ ...who, documentId: doc(outro.id, "nif", "2026-09-30").id, ...file })).rejects.toBeInstanceOf(PortalResourceNotFoundError);
    await expect(replace.execute({ ...who, documentId: doc(carla.id, "nif", "2026-09-30").id, ...file, mimeType: "image/gif" })).rejects.toBeInstanceOf(PortalBadRequestError);
  });
});

describe("Hub — validar / rejeitar envio do colaborador", () => {
  it("validar: fica válido, com a validade confirmada pelo RH", async () => {
    const { replace, review, doc, carla, who, file } = setup();
    const sent = await replace.execute({ ...who, documentId: doc(carla.id, "atestado_saude", "2026-09-30").id, ...file });
    const dto = await review.execute({ organizationId: ORG, actor: "rh@example.com", employeeId: carla.id, documentId: sent.id, decision: "approve", expiresAt: "2027-10-01" });
    expect(dto).toMatchObject({ displayStatus: "ok", expiresAt: "2027-10-01" });
  });

  it("rejeitar exige motivo, repõe a versão anterior e o Portal mostra o motivo", async () => {
    const { replace, review, list, documents, doc, carla, who, file } = setup();
    const old = doc(carla.id, "atestado_saude", "2026-09-30");
    const sent = await replace.execute({ ...who, documentId: old.id, ...file });
    const base = { organizationId: ORG, actor: "rh@example.com", employeeId: carla.id, documentId: sent.id };
    await expect(review.execute({ ...base, decision: "reject", note: "  " })).rejects.toBeInstanceOf(DocumentRejectionReasonRequiredError);
    await review.execute({ ...base, decision: "reject", note: "Foto ilegível" });
    expect((await documents.findById(ORG, old.id))!.isCurrent).toBe(true);
    await expect(review.execute({ ...base, decision: "approve" })).rejects.toBeInstanceOf(DocumentNotPendingError);

    const mine = (await list.execute(who)).find((d) => d.id === old.id)!;
    expect(mine).toMatchObject({ status: "valid", canReplace: true, lastRejection: { note: "Foto ilegível" } });
  });

  it("Caixa de pedidos: lista os envios por validar com o nome do colaborador", async () => {
    const { replace, employees, documents, categories, doc, carla, who, file } = setup();
    await replace.execute({ ...who, documentId: doc(carla.id, "atestado_saude", "2026-09-30").id, ...file });
    const pending = await new ListPendingDocumentsUseCase(documents, employees, categories).execute({ organizationId: ORG });
    expect(pending).toEqual([expect.objectContaining({ employeeName: "CARLA DEMO", categoryLabel: "Atestado de saúde", fileName: "novo.pdf" })]);
  });
});
