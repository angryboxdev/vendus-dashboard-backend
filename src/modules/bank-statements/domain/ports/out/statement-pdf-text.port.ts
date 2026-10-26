import type { PdfDocumentText } from "../../services/statement-pdf/pdf-text.js";

/** Texto posicionado de um PDF (sem interpretação). `null` se o ficheiro não for um PDF legível. */
export interface StatementPdfTextPort {
  extract(fileBuffer: Buffer): Promise<PdfDocumentText | null>;
}
