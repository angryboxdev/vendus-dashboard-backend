import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";

export class FakeDocumentStorage implements DocumentStoragePort {
  readonly uploads: Array<{ filename: string; mimeType: string }> = [];
  private nextUrl = "https://storage.fake/document.pdf";

  setNextUrl(url: string): void {
    this.nextUrl = url;
  }

  async store(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    this.uploads.push({ filename, mimeType });
    return this.nextUrl;
  }
}
