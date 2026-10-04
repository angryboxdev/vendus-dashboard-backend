import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { objectStorage } from "../../../../infra/scoped-db/object-storage.js";
import type { OrganizationFileStoragePort } from "../../domain/ports/out/organization-file-storage.port.js";

const BUCKET = "organization-assets";

export class SupabaseOrganizationFileStorageAdapter implements OrganizationFileStoragePort {
  async store(buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string> {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    return objectStorage.upload(BUCKET, `logo/${randomUUID()}/${safeName}`, buffer, mimeType, organizationId);
  }

  async getSignedUrl(storagePath: string, ttlSeconds: number, organizationId: OrganizationId): Promise<string> {
    return objectStorage.createSignedUrl(BUCKET, storagePath, ttlSeconds, organizationId);
  }
}
