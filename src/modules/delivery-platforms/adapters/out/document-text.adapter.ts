import { PDFParse } from "pdf-parse";
import type { DocumentTextPort } from "../../domain/ports/out/document-text.port.js";

/**
 * Texto de um ficheiro enviado: PDF pela camada de texto (`pdf-parse`, já dependência do projeto);
 * CSV/texto em UTF-8; XML (SAF-T) na codificação que declara (o do AirMenu é Windows-1252).
 * Os extratos das plataformas são PDF digitais (sem OCR).
 */
export class DocumentTextAdapter implements DocumentTextPort {
  async extract(fileName: string, content: Uint8Array): Promise<string | null> {
    const isPdf = content.length > 4 && String.fromCharCode(...content.subarray(0, 4)) === "%PDF";
    if (!isPdf) {
      const head = String.fromCharCode(...content.subarray(0, 200));
      const encoding = /^\s*<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1] ?? "utf-8";
      let text: string;
      try {
        text = new TextDecoder(encoding).decode(content).trim();
      } catch {
        text = new TextDecoder("utf-8").decode(content).trim();
      }
      return /\.(csv|txt|xml)$/i.test(fileName) && text.length > 0 ? text : null;
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
