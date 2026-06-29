import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";

export class FakeDocumentStoragePort implements DocumentStoragePort {
  readonly storedFiles: Array<{ filename: string; mimeType: string }> = [];
  readonly deletedUrls: string[] = [];
  private urlBase = "https://storage.example.com/invoices/";

  async store(_buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    this.storedFiles.push({ filename, mimeType });
    return `${this.urlBase}${filename}`;
  }

  async delete(url: string): Promise<void> {
    this.deletedUrls.push(url);
  }
}
