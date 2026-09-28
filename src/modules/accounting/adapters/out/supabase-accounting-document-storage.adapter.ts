import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { objectStorage } from "../../../../infra/scoped-db/object-storage.js";
import type { AccountingDocumentStoragePort } from "../../domain/ports/out/accounting-document-storage.port.js";

const BUCKET = "accounting-documents";

export class SupabaseAccountingDocumentStorageAdapter implements AccountingDocumentStoragePort {
  async store(buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string> {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${randomUUID()}/${safeName}`;
    return objectStorage.upload(BUCKET, path, buffer, mimeType, organizationId);
  }

  async getSignedUrl(storagePath: string, ttlSeconds: number, organizationId: OrganizationId): Promise<string> {
    return objectStorage.createSignedUrl(BUCKET, storagePath, ttlSeconds, organizationId);
  }

  async remove(storagePath: string, _organizationId: OrganizationId): Promise<void> {
    await objectStorage.remove(BUCKET, storagePath);
  }
}
