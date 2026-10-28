import { PDFParse } from "pdf-parse";
import type { DocumentTextPort } from "../../domain/ports/out/document-text.port.js";

/**
 * Texto de um ficheiro enviado: PDF pela camada de texto (`pdf-parse`, já dependência do projeto);
 * CSV/texto pelo conteúdo em UTF-8. Os extratos das plataformas são PDF digitais (sem OCR).
 */
export class DocumentTextAdapter implements DocumentTextPort {
  async extract(fileName: string, content: Uint8Array): Promise<string | null> {
    const isPdf = content.length > 4 && String.fromCharCode(...content.subarray(0, 4)) === "%PDF";
    if (!isPdf) {
      const text = new TextDecoder("utf-8").decode(content).trim();
      return /\.(csv|txt)$/i.test(fileName) && text.length > 0 ? text : null;
    }
    const parser = new PDFParse({ data: Buffer.from(content) });
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
