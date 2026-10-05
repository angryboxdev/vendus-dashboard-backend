import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { objectStorage } from "../../../../infra/scoped-db/object-storage.js";
import type { DocumentFileStoragePort } from "../../domain/ports/out/document-file-storage.port.js";

/**
 * Mesmo bucket privado dos documentos de colaborador (`hr-documents`, prefixo
 * `{org_id}/` — ADR-0015), numa subpasta `company/`: um único motor e um
 * único armazenamento (spec D9 — o nome `hr-` do bucket é histórico).
 */
const BUCKET = "hr-documents";

export class SupabaseDocumentFileStorageAdapter implements DocumentFileStoragePort {
  async store(buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string> {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    return objectStorage.upload(BUCKET, `company/${randomUUID()}/${safeName}`, buffer, mimeType, organizationId);
  }

  async getSignedUrl(storagePath: string, ttlSeconds: number, organizationId: OrganizationId): Promise<string> {
    return objectStorage.createSignedUrl(BUCKET, storagePath, ttlSeconds, organizationId);
  }
}
