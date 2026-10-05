import { mintOrganizationId, type OrganizationId } from "../../../../kernel/organization-id.js";
import { DocumentCategoryDefinition } from "../../domain/entities/document-category.js";
import {
  DocumentCategoryAlreadyExistsError,
  DocumentNotFoundError,
  InvalidDocumentError,
} from "../../domain/errors.js";
import type { DocumentAuditLogEntry, DocumentAuditLogPort } from "../../domain/ports/out/document-audit-log.port.js";
import type { DocumentFileStoragePort } from "../../domain/ports/out/document-file-storage.port.js";
import {
  GetCompanyDocumentDownloadUrlUseCase,
  GetCompanyDocumentHistoryUseCase,
  ListCompanyDocumentsUseCase,
  RemoveCompanyDocumentUseCase,
  ReplaceCompanyDocumentUseCase,
  UploadCompanyDocumentUseCase,
} from "../../application/use-cases/company-documents.use-cases.js";
import { FakeDocumentRepository } from "../fakes/fake-document-repository.js";
import { FakeDocumentCategoryRepository } from "../fakes/fake-document-category-repository.js";

const ORG = mintOrganizationId("org-a");
const OTHER_ORG = mintOrganizationId("org-b");

class FakeStorage implements DocumentFileStoragePort {
  private n = 0;
  async store(_b: Buffer, filename: string, _m: string, organizationId: OrganizationId): Promise<string> {
    this.n += 1;
    return `${organizationId}/company/${this.n}/${filename}`;
  }
  async getSignedUrl(storagePath: string): Promise<string> {
    return `https://signed.test/${storagePath}`;
  }
}

class FakeAudit implements DocumentAuditLogPort {
  readonly entries: DocumentAuditLogEntry[] = [];
  async record(entry: DocumentAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

async function setup() {
  const documents = new FakeDocumentRepository();
  const categories = new FakeDocumentCategoryRepository();
  const storage = new FakeStorage();
  const audit = new FakeAudit();
  for (const org of [ORG, OTHER_ORG]) {
    await categories.create(
      org,
      DocumentCategoryDefinition.create({
        organizationId: org,
        slug: "apolice_empresa",
        label: "Apólice de seguro",
        mandatory: false,
        acceptedMimeTypes: ["application/pdf"],
        scope: "company",
      }),
    );
  }
  const upload = new UploadCompanyDocumentUseCase(documents, categories, storage, audit);
  const file = { buffer: Buffer.from("%PDF"), filename: "apolice.pdf", mimeType: "application/pdf" };
  return { documents, categories, storage, audit, upload, file };
}

describe("Documentos da Empresa", () => {
  it("envia um documento da Empresa (categoria Empresa) e audita", async () => {
    const { upload, audit, file } = await setup();

    const dto = await upload.execute({
      organizationId: ORG,
      actor: "admin@exemplo.pt",
      viewerRole: "manager",
      category: "apolice_empresa",
      ...file,
      issuedAt: "2026-01-01",
      expiresAt: "2026-12-31",
      visibility: "management",
    });

    expect(dto).toMatchObject({ categoryLabel: "Apólice de seguro", version: 1, isCurrent: true, visibility: "management", issuedAt: "2026-01-01" });
    expect(audit.entries[0]).toMatchObject({ entityType: "company_document", action: "upload" });
  });

  it("recusa categoria só de colaborador, validade anterior à emissão e segunda versão 'atual' da mesma categoria", async () => {
    const { upload, file } = await setup();
    const base = { organizationId: ORG, actor: "a", viewerRole: "manager" as const, ...file, issuedAt: null, expiresAt: null, visibility: "management" as const };

    await expect(upload.execute({ ...base, category: "contrato_trabalho" })).rejects.toBeInstanceOf(InvalidDocumentError);
    await expect(
      upload.execute({ ...base, category: "apolice_empresa", issuedAt: "2026-06-01", expiresAt: "2026-01-01" }),
    ).rejects.toBeInstanceOf(InvalidDocumentError);
    await upload.execute({ ...base, category: "apolice_empresa" });
    await expect(upload.execute({ ...base, category: "apolice_empresa" })).rejects.toBeInstanceOf(DocumentCategoryAlreadyExistsError);
  });

  it("renovar preserva a versão anterior como 'Substituída' (histórico com as duas)", async () => {
    const { documents, categories, storage, audit, upload, file } = await setup();
    const v1 = await upload.execute({
      organizationId: ORG, actor: "a", viewerRole: "manager", category: "apolice_empresa", ...file, issuedAt: null, expiresAt: "2026-12-31", visibility: "management",
    });

    const v2 = await new ReplaceCompanyDocumentUseCase(documents, categories, storage, audit).execute({
      organizationId: ORG, actor: "a", viewerRole: "manager", documentId: v1.id, ...file, filename: "apolice-2027.pdf", issuedAt: null, expiresAt: "2027-12-31",
    });
    const history = await new GetCompanyDocumentHistoryUseCase(documents, categories).execute({ organizationId: ORG, viewerRole: "manager", documentId: v2.id });
    const list = await new ListCompanyDocumentsUseCase(documents, categories).execute({ organizationId: ORG, viewerRole: "manager" });

    expect(history.map((h) => [h.version, h.isCurrent])).toEqual([[2, true], [1, false]]);
    expect(list.map((d) => d.id)).toEqual([v2.id]);
  });

  it("visibilidade 'Só administração' fica escondida do gestor (lista, download e histórico)", async () => {
    const { documents, categories, storage, upload, file } = await setup();
    const doc = await upload.execute({
      organizationId: ORG, actor: "admin", viewerRole: "admin", category: "apolice_empresa", ...file, issuedAt: null, expiresAt: null, visibility: "admin",
    });

    expect(await new ListCompanyDocumentsUseCase(documents, categories).execute({ organizationId: ORG, viewerRole: "manager" })).toEqual([]);
    expect(await new ListCompanyDocumentsUseCase(documents, categories).execute({ organizationId: ORG, viewerRole: "admin" })).toHaveLength(1);
    await expect(
      new GetCompanyDocumentDownloadUrlUseCase(documents, storage).execute({ organizationId: ORG, viewerRole: "manager", documentId: doc.id }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  it("um gestor não pode criar documentos 'Só administração'", async () => {
    const { upload, file } = await setup();
    await expect(
      upload.execute({ organizationId: ORG, actor: "g", viewerRole: "manager", category: "apolice_empresa", ...file, issuedAt: null, expiresAt: null, visibility: "admin" }),
    ).rejects.toBeInstanceOf(InvalidDocumentError);
  });

  it("teste crítico 'Tenant isolation': a Empresa B nunca acede a um documento da Empresa A", async () => {
    const { documents, categories, storage, audit, upload, file } = await setup();
    const doc = await upload.execute({
      organizationId: ORG, actor: "a", viewerRole: "admin", category: "apolice_empresa", ...file, issuedAt: null, expiresAt: null, visibility: "management",
    });

    await expect(
      new GetCompanyDocumentDownloadUrlUseCase(documents, storage).execute({ organizationId: OTHER_ORG, viewerRole: "admin", documentId: doc.id }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
    await expect(
      new RemoveCompanyDocumentUseCase(documents, audit).execute({ organizationId: OTHER_ORG, actor: "x", viewerRole: "admin", documentId: doc.id }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
    expect(await new ListCompanyDocumentsUseCase(documents, categories).execute({ organizationId: OTHER_ORG, viewerRole: "admin" })).toEqual([]);
  });

  it("remover é lógico: sai da lista, mas a linha continua lá", async () => {
    const { documents, categories, audit, upload, file } = await setup();
    const doc = await upload.execute({
      organizationId: ORG, actor: "a", viewerRole: "manager", category: "apolice_empresa", ...file, issuedAt: null, expiresAt: null, visibility: "management",
    });

    await new RemoveCompanyDocumentUseCase(documents, audit).execute({ organizationId: ORG, actor: "a", viewerRole: "manager", documentId: doc.id });

    expect(await new ListCompanyDocumentsUseCase(documents, categories).execute({ organizationId: ORG, viewerRole: "manager" })).toEqual([]);
    expect((await documents.findById(ORG, doc.id))?.status).toBe("removed");
  });
});
