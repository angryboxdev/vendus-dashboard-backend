import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

export class FakeDocumentStoragePort implements DocumentStoragePort {
  readonly storedFiles: Array<{ filename: string; mimeType: string; organizationId: OrganizationId }> = [];
  readonly deletedUrls: string[] = [];
  private urlBase = "https://storage.example.com/invoices/";

  async store(_buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string> {
    this.storedFiles.push({ filename, mimeType, organizationId });
    return `${this.urlBase}${filename}`;
  }

  async delete(url: string): Promise<void> {
    this.deletedUrls.push(url);
  }
}
