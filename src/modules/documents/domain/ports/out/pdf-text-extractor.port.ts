/**
 * Texto de um PDF, para identificar o colaborador de um recibo importado
 * (ticket 10). Só texto já presente no PDF — sem OCR nem IA (task §25).
 */
export interface PdfTextExtractorPort {
  /** `null` se o PDF não tiver texto ou não puder ser lido — nunca lança. */
  extractText(buffer: Buffer): Promise<string | null>;
}
