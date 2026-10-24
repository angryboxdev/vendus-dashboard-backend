import { Document } from "../../domain/entities/document.js";
import type { DocumentCategoryDefinition } from "../../domain/entities/document-category.js";
import { PortalBadRequestError } from "../../domain/errors.js";
import type {
  GetMyDocumentChecklistPort,
  MyDocumentChecklistDTO,
  MyDocumentDTO,
  MySubmittableCategoryDTO,
  PortalIdentity,
  ReplaceMyDocumentPort,
  SubmitMyDocumentCommand,
  SubmitMyDocumentPort,
} from "../../domain/ports/in/my-document.ports.js";
import type { DocumentAuditLogPort } from "../../domain/ports/out/document-audit-log.port.js";
import type { DocumentCategoryRepositoryPort } from "../../domain/ports/out/document-category-repository.port.js";
import type { DocumentRepositoryPort } from "../../domain/ports/out/document-repository.port.js";
import type { DocumentEmployee, EmployeeDirectoryPort } from "../../domain/ports/out/employee-directory.port.js";
import type { EmployeeFileStoragePort } from "../../domain/ports/out/employee-file-storage.port.js";
import { canReplaceDocument } from "../../domain/services/document-replacement.service.js";
import {
  applicableCategoriesFor,
  buildDynamicRequirements,
  DEFAULT_MANDATORY_REQUIREMENTS,
  DOCUMENT_CATEGORY_BASE_LABELS,
  IDENTIFICATION_DOCUMENT_CATEGORIES,
} from "../../domain/services/document-status.service.js";
import { computeDocumentDisplayStatus } from "../../domain/services/document-validity.service.js";
import { resolvePortalEmployeeId } from "./employee-document-shared.js";
import { toMyDocumentDTO } from "./my-documents.use-cases.js";

/** O que o Portal aceita (o telemóvel envia PDF ou foto); a categoria pode restringir mais. */
const PORTAL_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
/** O recibo de vencimento é emitido pela empresa (importação de recibos): o colaborador nunca o envia. */
const COMPANY_ISSUED = new Set(["recibo_vencimento"]);
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

interface Submittable {
  slug: string;
  label: string;
  mandatory: boolean;
  requiresPeriod: boolean;
  accepts: string[];
}

const acceptsOf = (def: Pick<DocumentCategoryDefinition, "acceptedMimeTypes"> | null) =>
  def?.acceptedMimeTypes?.length ? def.acceptedMimeTypes.filter((m) => PORTAL_MIME_TYPES.includes(m)) : PORTAL_MIME_TYPES;

/**
 * Categorias para onde o colaborador pode enviar: identificação (fixa), as
 * configuráveis que se lhe aplicam (âmbito colaborador, cargo) e as periódicas
 * que ele próprio emite (ex.: recibo verde). Nunca as da empresa nem o recibo de vencimento.
 */
function submittableFor(defs: DocumentCategoryDefinition[], employee: Pick<DocumentEmployee, "positionId">): Submittable[] {
  const identityMandatory = DEFAULT_MANDATORY_REQUIREMENTS.some((r) => r.categories.some((c) => (IDENTIFICATION_DOCUMENT_CATEGORIES as readonly string[]).includes(c)));
  const identity = IDENTIFICATION_DOCUMENT_CATEGORIES.map((slug) => ({ slug, label: DOCUMENT_CATEGORY_BASE_LABELS[slug] ?? slug, mandatory: identityMandatory, requiresPeriod: false, accepts: PORTAL_MIME_TYPES }));
  const configurable = applicableCategoriesFor(defs, employee).map((c) => ({ slug: c.slug, label: c.label, mandatory: c.mandatory, requiresPeriod: false, accepts: acceptsOf(c) }));
  const periodic = defs
    .filter((c) => c.active && c.requiresPeriod && c.scope !== "company" && !COMPANY_ISSUED.has(c.slug))
    .filter((c) => c.positionIds.length === 0 || (employee.positionId !== null && c.positionIds.includes(employee.positionId)))
    .map((c) => ({ slug: c.slug, label: c.label, mandatory: false, requiresPeriod: true, accepts: acceptsOf(c) }));
  return [...identity, ...configurable, ...periodic].filter((c) => c.accepts.length > 0);
}

/**
 * Portal — Documentos: o que posso enviar (por categoria, com o estado atual)
 * e os obrigatórios em falta. Mesmas regras da ficha do RH (requisitos,
 * validade); pendente de validação conta como «Em validação», não como em falta.
 */
export class GetMyDocumentChecklistUseCase implements GetMyDocumentChecklistPort {
  constructor(
    private readonly employees: EmployeeDirectoryPort,
    private readonly documents: DocumentRepositoryPort,
    private readonly categories: DocumentCategoryRepositoryPort,
    private readonly today: () => string,
  ) {}

  async execute(identity: PortalIdentity): Promise<MyDocumentChecklistDTO> {
    const org = identity.organizationId;
    const employeeId = await resolvePortalEmployeeId(this.employees, identity);
    const employee = await this.employees.findById(org, employeeId);
    if (!employee || employee.status !== "active") return { categories: [], missingMandatory: [] };
    const [current, defs] = await Promise.all([this.documents.findCurrentByOwners(org, "employee", [employeeId]), this.categories.findMany(org, { activeOnly: true })]);
    const today = this.today();
    const now = new Date(`${today}T12:00:00Z`);
    const bySlug = new Map(current.filter((d) => d.period === null).map((d) => [d.category, d]));

    const categories: MySubmittableCategoryDTO[] = [];
    for (const c of submittableFor(defs, employee)) {
      const doc = c.requiresPeriod ? undefined : bySlug.get(c.slug);
      const shown = doc ? computeDocumentDisplayStatus(doc, now) : null;
      const status: MySubmittableCategoryDTO["status"] = c.requiresPeriod ? null : !doc ? "missing" : shown === "pending_validation" ? "pending" : shown === "expired" ? "expired" : shown === "expiring" ? "expiring" : "ok";
      const canSubmit = c.requiresPeriod || !doc || canReplaceDocument(doc, today).ok;
      // Envio recusado pelo RH: mostrar o motivo onde ainda falta (o colaborador envia outra vez).
      let lastRejection: MySubmittableCategoryDTO["lastRejection"] = null;
      if (!c.requiresPeriod && (status === "missing" || status === "expired" || status === "expiring")) {
        const newest = (await this.documents.findVersionHistory(org, "employee", employeeId, c.slug))[0];
        if (newest && newest.status === "rejected" && newest.reviewNote) lastRejection = { note: newest.reviewNote, at: newest.reviewedAt ?? newest.uploadedAt };
      }
      categories.push({ ...c, status, canSubmit, lastRejection });
    }

    const requirements = [...DEFAULT_MANDATORY_REQUIREMENTS, ...buildDynamicRequirements(applicableCategoriesFor(defs, employee))];
    const missingMandatory = requirements.flatMap((r) => {
      const doc = r.categories.map((s) => bySlug.get(s)).find((d) => d != null);
      const shown = doc ? computeDocumentDisplayStatus(doc, now) : null;
      if (shown === "ok" || shown === "expiring" || shown === "pending_validation") return [];
      return [{ id: r.id, label: r.label, categories: [...r.categories], status: shown === "expired" ? ("expired" as const) : ("missing" as const) }];
    });
    return { categories, missingMandatory };
  }
}

/**
 * Portal: o colaborador envia um documento para uma categoria permitida. Fica
 * sempre «Em validação» (origem `colaborador`) até um gerente ou o RH validar
 * (`POST …/documents/:docId/review`). Um documento atual só é substituído
 * quando o RH o permite (vencido / a vencer — regra do ticket 11).
 */
export class SubmitMyDocumentUseCase implements SubmitMyDocumentPort {
  constructor(
    private readonly employees: EmployeeDirectoryPort,
    private readonly documents: DocumentRepositoryPort,
    private readonly categories: DocumentCategoryRepositoryPort,
    private readonly storage: EmployeeFileStoragePort,
    private readonly auditLog: DocumentAuditLogPort,
    private readonly replace: ReplaceMyDocumentPort,
    private readonly today: () => string,
  ) {}

  async execute(command: SubmitMyDocumentCommand): Promise<MyDocumentDTO> {
    const org = command.organizationId;
    const employeeId = await resolvePortalEmployeeId(this.employees, command);
    const employee = await this.employees.findById(org, employeeId);
    if (!employee || employee.status !== "active") throw new PortalBadRequestError("A sua ficha não está ativa.");
    const defs = await this.categories.findMany(org, { activeOnly: true });
    const target = submittableFor(defs, employee).find((c) => c.slug === command.category);
    if (!target) throw new PortalBadRequestError("Não pode enviar documentos para esta pasta.");
    if (!target.accepts.includes(command.mimeType)) throw new PortalBadRequestError(`Formato não aceite para este documento (${target.accepts.includes("image/jpeg") ? "PDF ou foto" : "só PDF"}).`);
    const today = this.today();
    if (command.expiresAt != null && (!/^\d{4}-\d{2}-\d{2}$/.test(command.expiresAt) || command.expiresAt <= today)) {
      throw new PortalBadRequestError("A data de validade tem de ser depois de hoje.");
    }

    const current = (await this.documents.findCurrentByOwners(org, "employee", [employeeId])).filter((d) => d.category === target.slug);
    let period: string | null = null;
    if (target.requiresPeriod) {
      if (!command.period || !PERIOD.test(command.period)) throw new PortalBadRequestError("Indique o mês do documento.");
      if (current.some((d) => d.period === command.period)) throw new PortalBadRequestError("Já existe um documento deste mês. Fale com o RH se precisar de o corrigir.");
      period = command.period;
    } else {
      const existing = current.find((d) => d.period === null);
      if (existing) {
        if (existing.status === "pending_validation") throw new PortalBadRequestError("Já tem um envio deste documento em validação.");
        if (!canReplaceDocument(existing, today).ok) throw new PortalBadRequestError("Este documento está válido. Pode enviar um novo quando estiver a vencer.");
        // Vencido / a vencer: é uma substituição (nova versão, a anterior fica no histórico).
        return this.replace.execute({ ...command, documentId: existing.id });
      }
    }

    const storagePath = await this.storage.store(command.buffer, command.filename, command.mimeType, org);
    const doc = Document.createFirstVersion({
      owner: { type: "employee", id: employeeId },
      category: target.slug,
      mandatory: target.mandatory,
      fileName: command.filename,
      storagePath,
      mimeType: command.mimeType,
      fileSizeBytes: command.buffer.byteLength,
      origin: "colaborador",
      expiresAt: command.expiresAt ?? null,
      period,
      uploadedBy: command.actor,
    });
    const saved = await this.documents.create(org, doc).catch(async (e) => {
      await this.storage.remove(storagePath, org).catch(() => {});
      throw e;
    });
    await this.auditLog.record({
      organizationId: org,
      actor: command.actor,
      entityType: "employee_document",
      entityId: saved.id,
      action: "document_submitted",
      reason: `Documento "${target.label}" enviado pelo colaborador no Portal — aguarda validação`,
      before: null,
      after: saved.toProps(),
    });
    const def = defs.find((c) => c.slug === target.slug) ?? null;
    return toMyDocumentDTO(saved, def ?? { label: target.label, requiresPeriod: target.requiresPeriod }, today, null);
  }
}
