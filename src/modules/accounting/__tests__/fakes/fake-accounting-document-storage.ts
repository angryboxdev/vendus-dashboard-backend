import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AccountingDocumentStoragePort } from "../../domain/ports/out/accounting-document-storage.port.js";

export class FakeAccountingDocumentStorage implements AccountingDocumentStoragePort {
  async store(_buffer: Buffer, filename: string, _mimeType: string, _organizationId: OrganizationId): Promise<string> {
    return `fake/${filename}`;
  }

  async getSignedUrl(storagePath: string, _ttlSeconds: number, _organizationId: OrganizationId): Promise<string> {
    return `https://fake-signed-url/${storagePath}`;
  }

  async remove(_storagePath: string, _organizationId: OrganizationId): Promise<void> {
    // no-op
  }
}
