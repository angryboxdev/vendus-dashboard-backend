export interface DocumentStoragePort {
  store(buffer: Buffer, filename: string, mimeType: string): Promise<string>;
}
