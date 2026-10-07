import { randomUUID } from "crypto";
import type { DocumentRepositoryPort } from "../../../documents/domain/ports/out/document-repository.port.js";
import type { DocumentCategoryRepositoryPort } from "../../../documents/domain/ports/out/document-category-repository.port.js";
import { EmployeeDocumentNotFoundError, PortalBadRequestError, PortalResourceNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { HrFileStoragePort } from "../../domain/ports/out/hr-file-storage.port.js";
import type { PortalAccountPort } from "../../domain/ports/out/portal-account.port.js";
import type { MyDocumentDTO, PortalIdentity, ReplaceMyDocumentCommand, ReplaceMyDocumentPort } from "../../domain/ports/in/portal-me.ports.js";
import type {
  PendingDocumentDTO,
  ListPendingDocumentsPort,
  ReviewEmployeeDocumentCommand,
  ReviewEmployeeDocumentPort,
} from "../../domain/ports/in/employee-document.ports.js";
import { canReplaceDocument } from "../../domain/services/document-replacement.service.js";
import { resolvePortalEmployeeId } from "./portal-me.use-cases.js";
import { toMyDocumentDTO } from "./portal-self-service.use-cases.js";
import { toEmployeeDocumentDTO } from "./shared.js";

const PORTAL_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/**
 * Portal (ticket 11): o colaborador substitui um documento seu **vencido
 * ou a vencer em 30 dias** por PDF/foto. A nova versão fica "Em validação"
 * (origem `colaborador`); a anterior fica no histórico. Não há remover.
 */
export class ReplaceMyDocumentUseCase implements ReplaceMyDocumentPort {
  constructor(
    private readonly accounts: PortalAccountPort,
    private readonly documents: DocumentRepositoryPort,
    private readonly categories: DocumentCategoryRepositoryPort,
    private readonly storage: HrFileStoragePort,
    private readonly auditLog: HrAuditLogPort,
    private readonly today: () => string,
  ) {}

  async execute(command: ReplaceMyDocumentCommand): Promise<MyDocumentDTO> {
    const org = command.organizationId;
    const employeeId = await resolvePortalEmployeeId(this.accounts, command);
    const previous = await this.documents.findById(org, command.documentId);
    if (!previous || previous.ownerType !== "employee" || previous.ownerId !== employeeId || !previous.isCurrent) {
      throw new PortalResourceNotFoundError("Documento");
    }
    const today = this.today();
    const check = canReplaceDocument(previous, today);
    if (!check.ok) throw new PortalBadRequestError(check.reason);

    const category = await this.categories.findBySlug(org, previous.category);
    const accepted = category?.acceptedMimeTypes?.length ? category.acceptedMimeTypes.filter((m) => PORTAL_MIME_TYPES.includes(m)) : PORTAL_MIME_TYPES;
    if (!accepted.includes(command.mimeType)) throw new PortalBadRequestError(`Formato não aceite para este documento (${accepted.includes("image/jpeg") ? "PDF ou foto" : "só PDF"}).`);
    if (command.expiresAt != null && (!/^\d{4}-\d{2}-\d{2}$/.test(command.expiresAt) || command.expiresAt <= today)) {
      throw new PortalBadRequestError("A nova data de validade tem de ser depois de hoje.");
    }

    const storagePath = await this.storage.store("document", command.buffer, command.filename, command.mimeType, org);
    const next = previous.supersede({
      fileName: command.filename,
      storagePath,
      mimeType: command.mimeType,
      fileSizeBytes: command.buffer.byteLength,
      expiresAt: command.expiresAt ?? null,
      uploadedBy: command.actor,
      origin: "colaborador",
    });
    const saved = await this.documents.create(org, next).catch(async (e) => {
      await this.storage.remove("document", storagePath, org).catch(() => {});
      throw e;
    });
    await this.documents.update(org, previous.markSuperseded());

    await this.auditLog.record({
      organizationId: org,
      actor: command.actor,
      entityType: "employee_document",
      entityId: saved.id,
      employeeId,
      action: "document_submitted",
      description: `Documento "${category?.label ?? saved.category}" enviado pelo colaborador no Portal (v${previous.version} → v${saved.version}) — aguarda validação`,
      before: previous.toProps(),
      after: saved.toProps(),
      correlationId: randomUUID(),
    });
    return toMyDocumentDTO(saved, category ?? null, today, null);
  }
}

/**
 * Hub: o RH valida ou rejeita (com motivo) um envio do colaborador. Rejeitar
 * repõe a versão anterior como a atual — o estado do colaborador volta ao
 * que era (ex.: "Vencido") e ele pode enviar outra vez.
 */
export class ReviewEmployeeDocumentUseCase implements ReviewEmployeeDocumentPort {
  constructor(
    private readonly documents: DocumentRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: ReviewEmployeeDocumentCommand) {
    const org = command.organizationId;
    const doc = await this.documents.findById(org, command.documentId);
    if (!doc || doc.ownerType !== "employee" || doc.ownerId !== command.employeeId) throw new EmployeeDocumentNotFoundError(command.documentId);

    if (command.decision === "approve") {
      const validated = doc.validate(command.actor);
      const withExpiry = command.expiresAt !== undefined ? validated.withExpiry(command.expiresAt) : validated;
      const saved = await this.documents.update(org, withExpiry);
      await this.auditLog.record({
        organizationId: org,
        actor: command.actor,
        entityType: "employee_document",
        entityId: saved.id,
        employeeId: command.employeeId,
        action: "document_validated",
        description: `Documento "${saved.category}" enviado pelo colaborador validado`,
        before: doc.toProps(),
        after: saved.toProps(),
        correlationId: randomUUID(),
      });
      return toEmployeeDocumentDTO(saved);
    }

    const rejected = doc.reject(command.actor, command.note ?? "");
    const saved = await this.documents.update(org, rejected);
    if (doc.previousVersionId) {
      const previous = await this.documents.findById(org, doc.previousVersionId);
      if (previous) await this.documents.update(org, previous.restoreAsCurrent());
    }
    await this.auditLog.record({
      organizationId: org,
      actor: command.actor,
      entityType: "employee_document",
      entityId: saved.id,
      employeeId: command.employeeId,
      action: "document_rejected",
      description: `Documento "${saved.category}" enviado pelo colaborador rejeitado: ${saved.reviewNote}`,
      before: doc.toProps(),
      after: saved.toProps(),
      correlationId: randomUUID(),
    });
    return toEmployeeDocumentDTO(saved);
  }
}

/** Caixa de pedidos (ticket 13): envios do colaborador por validar, mais antigos primeiro. */
export class ListPendingDocumentsUseCase implements ListPendingDocumentsPort {
  constructor(
    private readonly documents: DocumentRepositoryPort,
    private readonly employees: EmployeeRepositoryPort,
    private readonly categories: DocumentCategoryRepositoryPort,
  ) {}

  async execute(command: { organizationId: PortalIdentity["organizationId"] }): Promise<PendingDocumentDTO[]> {
    const org = command.organizationId;
    const [pending, cats] = await Promise.all([this.documents.findPendingValidation(org), this.categories.findMany(org)]);
    const labels = new Map(cats.map((c) => [c.slug, c.label]));
    const result: PendingDocumentDTO[] = [];
    for (const d of pending) {
      const e = await this.employees.findById(org, d.ownerId);
      result.push({
        id: d.id,
        employeeId: d.ownerId,
        employeeName: e?.fullName ?? d.ownerId,
        categoryLabel: labels.get(d.category) ?? d.category,
        fileName: d.fileName,
        expiresAt: d.expiresAt,
        submittedAt: d.uploadedAt,
      });
    }
    return result.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }
}
