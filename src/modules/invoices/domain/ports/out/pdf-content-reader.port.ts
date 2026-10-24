import type { PdfContent } from "../../entities/invoice-reading.js";

/** Texto nativo com posições + QR descodificados localmente (sem IA). null quando o ficheiro não é um PDF legível. */
export interface PdfContentReaderPort {
  read(fileBuffer: Buffer, mimeType: string): Promise<PdfContent | null>;
}
