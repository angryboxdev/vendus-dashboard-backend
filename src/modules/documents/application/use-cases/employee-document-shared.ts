import type { Document as EmployeeDocument } from "../../domain/entities/document.js";
import type { EmployeeDocumentDTO } from "../../domain/ports/in/employee-document.ports.js";
import { computeDocumentDisplayStatus } from "../../domain/services/document-status.service.js";
import type { EmployeeDirectoryPort } from "../../domain/ports/out/employee-directory.port.js";
import { PortalNotLinkedError } from "../../domain/errors.js";
import type { PortalIdentity } from "../../domain/ports/in/my-document.ports.js";

/** Bucket de documentos é privado com TTL curto — gerado só on-demand. */
export const DOCUMENT_SIGNED_URL_TTL_SECONDS = 120;

export function toEmployeeDocumentDTO(doc: EmployeeDocument): EmployeeDocumentDTO {
  return {
    id: doc.id,
    employeeId: doc.ownerId,
    category: doc.category,
    mandatory: doc.mandatory,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileSizeBytes: doc.fileSizeBytes,
    origin: doc.origin,
    expiresAt: doc.expiresAt,
    period: doc.period,
    version: doc.version,
    previousVersionId: doc.previousVersionId,
    displayStatus: computeDocumentDisplayStatus(doc),
    uploadedBy: doc.uploadedBy,
    uploadedAt: doc.uploadedAt,
  };
}

/** Portal: o colaborador vem sempre da conta da sessão, nunca do pedido. */
export async function resolvePortalEmployeeId(employees: EmployeeDirectoryPort, identity: PortalIdentity): Promise<string> {
  const employeeId = await employees.findLinkedEmployeeId(identity.organizationId, identity.userId);
  if (!employeeId) throw new PortalNotLinkedError();
  return employeeId;
}
