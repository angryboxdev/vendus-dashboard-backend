import { randomUUID } from "crypto";
import { objectStorage } from "../../../../infra/scoped-db/object-storage.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { DistributionFilesPort } from "../../domain/ports/out/distributions.ports.js";

/**
 * Mesmo bucket privado do motor de documentos (`hr-documents`, prefixo
 * `{org_id}/` — ADR-0015), na subpasta `distributions/`. O ficheiro é
 * guardado uma vez por envio, não uma vez por destinatário.
 */
const BUCKET = "hr-documents";
const TTL_SECONDS = 120;

export class SupabaseDistributionFilesAdapter implements DistributionFilesPort {
  async store(org: OrganizationId, buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return objectStorage.upload(BUCKET, `distributions/${randomUUID()}/${safeName}`, buffer, mimeType, org);
  }

  async signedUrl(org: OrganizationId, storagePath: string, _fileName: string): Promise<string> {
    return objectStorage.createSignedUrl(BUCKET, storagePath, TTL_SECONDS, org);
  }
}
