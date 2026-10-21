import type { PdfTextExtractorPort } from "../../domain/ports/out/pdf-text-extractor.port.js";

/** O "PDF" de teste é o próprio texto em UTF-8; um buffer vazio simula um PDF digitalizado (sem texto). */
export class FakePdfTextExtractor implements PdfTextExtractorPort {
  async extractText(buffer: Buffer): Promise<string | null> {
    const text = buffer.toString("utf8").trim();
    return text.length > 0 ? text : null;
  }
}
