import { objectStorage } from "../../../../infra/scoped-db/object-storage.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AbsenceAttachmentStoragePort } from "../../domain/ports/out/absences.ports.js";

/** Anexos dos pedidos de ausência no bucket privado `hr-documents` (prefixo da organização; URL assinado de 5 min). */
export class SupabaseAbsenceAttachmentStorage implements AbsenceAttachmentStoragePort {
  upload(org: OrganizationId, path: string, bytes: Buffer, mime: string) {
    return objectStorage.upload("hr-documents", path, bytes, mime, org);
  }
  signedUrl(org: OrganizationId, path: string) {
    return objectStorage.createSignedUrl("hr-documents", path, 300, org);
  }
}
