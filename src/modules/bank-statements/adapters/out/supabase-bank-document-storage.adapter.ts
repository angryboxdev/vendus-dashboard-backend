import { objectStorage } from "../../../../infra/scoped-db/object-storage.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

const BUCKET = "bank-statement-documents";

export class SupabaseBankDocumentStorageAdapter implements DocumentStoragePort {
  async store(buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string> {
    const timestamp = Date.now();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${timestamp}_${safeName}`;

    // DB4: bank-statement-documents hasn't opted into prefixing yet.
    const actualPath = await objectStorage.upload(BUCKET, path, buffer, mimeType, organizationId);
    return objectStorage.getPublicUrl(BUCKET, actualPath, organizationId);
  }
}
