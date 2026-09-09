import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

export class FakeDocumentStorage implements DocumentStoragePort {
  readonly stored: Array<{ buffer: Buffer; filename: string; mimeType: string; organizationId: OrganizationId; url: string }> = [];
  readonly deleted: string[] = [];

  private urlCounter = 0;

  async store(buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string> {
    const url = `https://fake-storage.example.com/${++this.urlCounter}_${filename}`;
    this.stored.push({ buffer, filename, mimeType, organizationId, url });
    return url;
  }

  async delete(url: string): Promise<void> {
    this.deleted.push(url);
  }
}
