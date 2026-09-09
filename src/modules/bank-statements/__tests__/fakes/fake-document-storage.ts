import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

export class FakeDocumentStorage implements DocumentStoragePort {
  readonly uploads: Array<{ filename: string; mimeType: string; organizationId: OrganizationId }> = [];
  private nextUrl = "https://storage.fake/document.pdf";

  setNextUrl(url: string): void {
    this.nextUrl = url;
  }

  async store(buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string> {
    this.uploads.push({ filename, mimeType, organizationId });
    return this.nextUrl;
  }
}
