import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { objectStorage } from "../../../../infra/scoped-db/object-storage.js";
import type { EmployeeFileStoragePort } from "../../domain/ports/out/employee-file-storage.port.js";

/**
 * Documentos de colaborador no bucket privado `hr-documents` (prefixo
 * `{org_id}/` — ADR-0015), no mesmo caminho que o RH antigo usava
 * (`{uuid}/{nome}`), para os ficheiros existentes continuarem a abrir.
 */
const BUCKET = "hr-documents";

export class SupabaseEmployeeFileStorageAdapter implements EmployeeFileStoragePort {
  async store(buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string> {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    return objectStorage.upload(BUCKET, `${randomUUID()}/${safeName}`, buffer, mimeType, organizationId);
  }

  async getSignedUrl(storagePath: string, ttlSeconds: number, organizationId: OrganizationId): Promise<string> {
    return objectStorage.createSignedUrl(BUCKET, storagePath, ttlSeconds, organizationId);
  }

  async remove(storagePath: string, _organizationId: OrganizationId): Promise<void> {
    await objectStorage.remove(BUCKET, storagePath);
  }
}
