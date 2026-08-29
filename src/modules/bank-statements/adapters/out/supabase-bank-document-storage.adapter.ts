import { objectStorage } from "../../../../infra/scoped-db/object-storage.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";

const BUCKET = "bank-statement-documents";

export class SupabaseBankDocumentStorageAdapter implements DocumentStoragePort {
  async store(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const timestamp = Date.now();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${timestamp}_${safeName}`;

    await objectStorage.upload(BUCKET, path, buffer, mimeType);
    return objectStorage.getPublicUrl(BUCKET, path);
  }
}
