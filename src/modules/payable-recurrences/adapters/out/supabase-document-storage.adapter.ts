import { objectStorage } from "../../../../infra/scoped-db/object-storage.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

const BUCKET = "recurrence-documents";

export class SupabaseRecurrenceDocumentStorageAdapter implements DocumentStoragePort {
  async store(buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string> {
    const timestamp = Date.now();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${timestamp}_${safeName}`;

    // DB4: recurrence-documents hasn't opted into prefixing yet.
    const actualPath = await objectStorage.upload(BUCKET, path, buffer, mimeType, organizationId);
    return objectStorage.getPublicUrl(BUCKET, actualPath, organizationId);
  }

  async delete(url: string): Promise<void> {
    const marker = `/object/public/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return; // not from this bucket, skip
    const path = url.slice(idx + marker.length);

    await objectStorage.remove(BUCKET, path);
  }
}
