import type { Document } from "../../domain/entities/document.js";
import type { DocumentCategoryDefinition } from "../../domain/entities/document-category.js";
import { EmployeeDocumentNotFoundError, PortalResourceNotFoundError } from "../../domain/errors.js";
import type { GetEmployeeDocumentDownloadUrlPort } from "../../domain/ports/in/employee-document.ports.js";
import type { GetMyDocumentUrlPort, ListMyDocumentsPort, MyDocumentDTO, PortalIdentity } from "../../domain/ports/in/my-document.ports.js";
import type { DocumentCategoryRepositoryPort } from "../../domain/ports/out/document-category-repository.port.js";
import type { DocumentRepositoryPort } from "../../domain/ports/out/document-repository.port.js";
import type { EmployeeDirectoryPort } from "../../domain/ports/out/employee-directory.port.js";
import { canReplaceDocument } from "../../domain/services/document-replacement.service.js";
import { DOCUMENT_CATEGORY_BASE_LABELS } from "../../domain/services/document-status.service.js";
import { resolvePortalEmployeeId } from "./employee-document-shared.js";

export function toMyDocumentDTO(
  d: Document,
  cat: Pick<DocumentCategoryDefinition, "label" | "requiresPeriod"> | null,
  today: string,
  lastRejection: MyDocumentDTO["lastRejection"],
): MyDocumentDTO {
  return {
    id: d.id,
    // Identificação (categorias fixas, fora da tabela) com o nome amigável — nunca o código interno.
    categoryLabel: cat?.label ?? DOCUMENT_CATEGORY_BASE_LABELS[d.category] ?? d.category,
    category: d.category,
    fileName: d.fileName,
    mimeType: d.mimeType,
    status: d.status,
    canReplace: canReplaceDocument(d, today).ok,
    lastRejection,
    period: d.period,
    isPayslip: cat?.requiresPeriod === true,
    issuedAt: d.issuedAt,
    expiresAt: d.expiresAt,
    uploadedAt: d.uploadedAt,
  };
}

/** Portal: documentos do próprio — versões atuais, sem removidos/rejeitados. Recibos = categorias com período. */
export class ListMyDocumentsUseCase implements ListMyDocumentsPort {
  constructor(
    private readonly employees: EmployeeDirectoryPort,
    private readonly documents: DocumentRepositoryPort,
    private readonly categories: DocumentCategoryRepositoryPort,
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  async execute(identity: PortalIdentity): Promise<MyDocumentDTO[]> {
    const org = identity.organizationId;
    const employeeId = await resolvePortalEmployeeId(this.employees, identity);
    const [docs, cats] = await Promise.all([this.documents.findCurrentByOwners(org, "employee", [employeeId]), this.categories.findMany(org)]);
    const bySlug = new Map(cats.map((c) => [c.slug, c]));
    const today = this.today();
    const visible = docs.filter((d) => d.status !== "removed" && d.status !== "rejected");
    const result: MyDocumentDTO[] = [];
    for (const d of visible) {
      // Só os substituíveis podem ter uma rejeição recente a mostrar — evita ler o histórico de todos.
      let lastRejection: MyDocumentDTO["lastRejection"] = null;
      if (canReplaceDocument(d, today).ok) {
        const newest = (await this.documents.findVersionHistory(org, "employee", employeeId, d.category))[0];
        if (newest && newest.status === "rejected" && newest.reviewNote) lastRejection = { note: newest.reviewNote, at: newest.reviewedAt ?? newest.uploadedAt };
      }
      result.push(toMyDocumentDTO(d, bySlug.get(d.category) ?? null, today, lastRejection));
    }
    return result.sort((a, b) => (b.period ?? "").localeCompare(a.period ?? "") || b.uploadedAt.localeCompare(a.uploadedAt));
  }
}

/** Portal: download pelo URL assinado de curta duração, sempre com o colaborador da sessão. */
export class GetMyDocumentUrlUseCase implements GetMyDocumentUrlPort {
  constructor(
    private readonly employees: EmployeeDirectoryPort,
    private readonly getDownloadUrl: GetEmployeeDocumentDownloadUrlPort,
  ) {}

  async execute(identity: PortalIdentity, documentId: string): Promise<{ url: string }> {
    const employeeId = await resolvePortalEmployeeId(this.employees, identity);
    try {
      return await this.getDownloadUrl.execute({ organizationId: identity.organizationId, employeeId, documentId });
    } catch (e) {
      if (e instanceof EmployeeDocumentNotFoundError) throw new PortalResourceNotFoundError("Documento");
      throw e;
    }
  }
}
