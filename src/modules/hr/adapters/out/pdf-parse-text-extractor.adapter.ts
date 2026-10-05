import { PDFParse } from "pdf-parse";
import type { PdfTextExtractorPort } from "../../domain/ports/out/pdf-text-extractor.port.js";

/** `pdf-parse` (já dependência do projeto, usado na importação de faturas) — só a camada de texto do PDF. */
export class PdfParseTextExtractorAdapter implements PdfTextExtractorPort {
  async extractText(buffer: Buffer): Promise<string | null> {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const text = (result.text ?? "").trim();
      return text.length > 0 ? text : null;
    } catch {
      return null;
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
}
