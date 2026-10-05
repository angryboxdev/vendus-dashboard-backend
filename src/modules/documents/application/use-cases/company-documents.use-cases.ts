import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { Document, type DocumentOwner } from "../../domain/entities/document.js";
import { scopeAllowsOwner } from "../../domain/entities/document-category.js";
import {
  DocumentCategoryAlreadyExistsError,
  DocumentCategoryConfigNotFoundError,
  DocumentNotFoundError,
  InvalidDocumentError,
} from "../../domain/errors.js";
import type {
  CompanyDocumentDTO,
  CompanyDocumentQuery,
  DocumentViewerRole,
  GetCompanyDocumentDownloadUrlPort,
  GetCompanyDocumentHistoryPort,
  ListCompanyDocumentsPort,
  ListCompanyDocumentsQuery,
  RemoveCompanyDocumentCommand,
  RemoveCompanyDocumentPort,
  ReplaceCompanyDocumentCommand,
  ReplaceCompanyDocumentPort,
  UploadCompanyDocumentCommand,
  UploadCompanyDocumentPort,
} from "../../domain/ports/in/company-document.ports.js";
import type { DocumentAuditLogPort } from "../../domain/ports/out/document-audit-log.port.js";
import type { DocumentCategoryRepositoryPort } from "../../domain/ports/out/document-category-repository.port.js";
import type { DocumentFileStoragePort } from "../../domain/ports/out/document-file-storage.port.js";
import type { DocumentRepositoryPort } from "../../domain/ports/out/document-repository.port.js";
import { computeDocumentDisplayStatus } from "../../domain/services/document-validity.service.js";
import { canViewCompanyDocument } from "../../domain/services/document-visibility.service.js";

/** URL assinado de curta duração, mesma política dos documentos de colaborador. */
export const COMPANY_DOCUMENT_URL_TTL_SECONDS = 120;

function companyOwner(organizationId: OrganizationId): DocumentOwner {
  return { type: "company", id: organizationId };
}

async function categoryLabels(categories: DocumentCategoryRepositoryPort, organizationId: OrganizationId): Promise<Map<string, string>> {
  return new Map((await categories.findMany(organizationId)).map((c) => [c.slug, c.label]));
}

function toDto(doc: Document, labels: Map<string, string>): CompanyDocumentDTO {
  return {
    id: doc.id,
    category: doc.category,
    categoryLabel: labels.get(doc.category) ?? doc.category,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileSizeBytes: doc.fileSizeBytes,
    issuedAt: doc.issuedAt,
    expiresAt: doc.expiresAt,
    visibility: doc.visibility ?? "management",
    displayStatus: computeDocumentDisplayStatus(doc),
    version: doc.version,
    isCurrent: doc.isCurrent,
    uploadedBy: doc.uploadedBy,
    uploadedAt: doc.uploadedAt,
  };
}

/**
 * Carrega um documento da Empresa desta organização e visível para o papel —
 * caso contrário 404 (nunca revela que existe um documento de outra
 * organização ou de acesso restrito).
 */
async function loadVisible(
  documents: DocumentRepositoryPort,
  organizationId: OrganizationId,
  viewerRole: DocumentViewerRole,
  documentId: string,
): Promise<Document> {
  const doc = await documents.findById(organizationId, documentId);
  if (!doc || !doc.belongsTo(companyOwner(organizationId)) || !canViewCompanyDocument(doc.visibility, viewerRole)) {
    throw new DocumentNotFoundError(documentId);
  }
  return doc;
}

function validateDates(issuedAt: string | null, expiresAt: string | null): void {
  if (issuedAt && expiresAt && expiresAt < issuedAt) {
    throw new InvalidDocumentError("A data de validade não pode ser anterior à data de emissão");
  }
}

export class ListCompanyDocumentsUseCase implements ListCompanyDocumentsPort {
  constructor(
    private readonly documents: DocumentRepositoryPort,
    private readonly categories: DocumentCategoryRepositoryPort,
  ) {}

  async execute(query: ListCompanyDocumentsQuery): Promise<CompanyDocumentDTO[]> {
    const [docs, labels] = await Promise.all([
      this.documents.findCurrentByOwners(query.organizationId, "company", [query.organizationId]),
      categoryLabels(this.categories, query.organizationId),
    ]);
    return docs.filter((d) => canViewCompanyDocument(d.visibility, query.viewerRole)).map((d) => toDto(d, labels));
  }
}

export class UploadCompanyDocumentUseCase implements UploadCompanyDocumentPort {
  constructor(
    private readonly documents: DocumentRepositoryPort,
    private readonly categories: DocumentCategoryRepositoryPort,
    private readonly storage: DocumentFileStoragePort,
    private readonly auditLog: DocumentAuditLogPort,
  ) {}

  async execute(command: UploadCompanyDocumentCommand): Promise<CompanyDocumentDTO> {
    const category = await this.categories.findBySlug(command.organizationId, command.category);
    if (!category || !category.active) throw new DocumentCategoryConfigNotFoundError(command.category);
    // Só categorias com âmbito Empresa ou Ambos (task §11).
    if (!scopeAllowsOwner(category.scope, "company")) {
      throw new InvalidDocumentError(`A categoria "${category.label}" é só para documentos de colaborador`);
    }
    if (category.acceptedMimeTypes.length > 0 && !category.acceptedMimeTypes.includes(command.mimeType)) {
      throw new InvalidDocumentError(`Formato não aceite para "${category.label}"`);
    }
    if (command.visibility === "admin" && command.viewerRole !== "admin") {
      throw new InvalidDocumentError("Só administradores podem criar documentos visíveis apenas à administração");
    }
    validateDates(command.issuedAt, command.expiresAt);

    const owner = companyOwner(command.organizationId);
    const current = await this.documents.findCurrentByOwners(command.organizationId, "company", [owner.id]);
    if (current.some((d) => d.category === command.category)) throw new DocumentCategoryAlreadyExistsError(command.category);

    const storagePath = await this.storage.store(command.buffer, command.filename, command.mimeType, command.organizationId);
    const created = await this.documents.create(
      command.organizationId,
      Document.createFirstVersion({
        owner,
        category: command.category,
        mandatory: false,
        fileName: command.filename,
        storagePath,
        mimeType: command.mimeType,
        fileSizeBytes: command.buffer.byteLength,
        origin: "rh",
        issuedAt: command.issuedAt,
        expiresAt: command.expiresAt,
        visibility: command.visibility,
        uploadedBy: command.actor,
      }),
    );

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "company_document",
      entityId: created.id,
      action: "upload",
      after: created.toProps(),
    });
    return toDto(created, new Map([[category.slug, category.label]]));
  }
}

export class ReplaceCompanyDocumentUseCase implements ReplaceCompanyDocumentPort {
  constructor(
    private readonly documents: DocumentRepositoryPort,
    private readonly categories: DocumentCategoryRepositoryPort,
    private readonly storage: DocumentFileStoragePort,
    private readonly auditLog: DocumentAuditLogPort,
  ) {}

  async execute(command: ReplaceCompanyDocumentCommand): Promise<CompanyDocumentDTO> {
    const previous = await loadVisible(this.documents, command.organizationId, command.viewerRole, command.documentId);
    if (command.visibility === "admin" && command.viewerRole !== "admin") {
      throw new InvalidDocumentError("Só administradores podem tornar um documento visível apenas à administração");
    }
    validateDates(command.issuedAt, command.expiresAt);

    const storagePath = await this.storage.store(command.buffer, command.filename, command.mimeType, command.organizationId);
    const next = previous.supersede({
      fileName: command.filename,
      storagePath,
      mimeType: command.mimeType,
      fileSizeBytes: command.buffer.byteLength,
      issuedAt: command.issuedAt,
      expiresAt: command.expiresAt,
      ...(command.visibility && { visibility: command.visibility }),
      uploadedBy: command.actor,
    });
    // Nova versão primeiro: se falhar, a anterior continua "atual" (nunca fica sem versão atual).
    const created = await this.documents.create(command.organizationId, next);
    await this.documents.update(command.organizationId, previous.markSuperseded());

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "company_document",
      entityId: created.id,
      action: "replace",
      before: previous.toProps(),
      after: created.toProps(),
    });
    return toDto(created, await categoryLabels(this.categories, command.organizationId));
  }
}

export class RemoveCompanyDocumentUseCase implements RemoveCompanyDocumentPort {
  constructor(
    private readonly documents: DocumentRepositoryPort,
    private readonly auditLog: DocumentAuditLogPort,
  ) {}

  async execute(command: RemoveCompanyDocumentCommand): Promise<void> {
    const doc = await loadVisible(this.documents, command.organizationId, command.viewerRole, command.documentId);
    const removed = doc.remove();
    await this.documents.update(command.organizationId, removed);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "company_document",
      entityId: doc.id,
      action: "remove",
      before: doc.toProps(),
      after: removed.toProps(),
    });
  }
}

export class GetCompanyDocumentDownloadUrlUseCase implements GetCompanyDocumentDownloadUrlPort {
  constructor(
    private readonly documents: DocumentRepositoryPort,
    private readonly storage: DocumentFileStoragePort,
  ) {}

  async execute(query: CompanyDocumentQuery): Promise<{ url: string }> {
    const doc = await loadVisible(this.documents, query.organizationId, query.viewerRole, query.documentId);
    return { url: await this.storage.getSignedUrl(doc.storagePath, COMPANY_DOCUMENT_URL_TTL_SECONDS, query.organizationId) };
  }
}

export class GetCompanyDocumentHistoryUseCase implements GetCompanyDocumentHistoryPort {
  constructor(
    private readonly documents: DocumentRepositoryPort,
    private readonly categories: DocumentCategoryRepositoryPort,
  ) {}

  async execute(query: CompanyDocumentQuery): Promise<CompanyDocumentDTO[]> {
    const doc = await loadVisible(this.documents, query.organizationId, query.viewerRole, query.documentId);
    const [history, labels] = await Promise.all([
      this.documents.findVersionHistory(query.organizationId, "company", query.organizationId, doc.category),
      categoryLabels(this.categories, query.organizationId),
    ]);
    return history.filter((d) => canViewCompanyDocument(d.visibility, query.viewerRole)).map((d) => toDto(d, labels));
  }
}
