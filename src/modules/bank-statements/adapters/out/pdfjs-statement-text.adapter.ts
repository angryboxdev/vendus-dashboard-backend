import type { StatementPdfTextPort } from "../../domain/ports/out/statement-pdf-text.port.js";
import type { PdfDocumentText, PdfTextItem } from "../../domain/services/statement-pdf/pdf-text.js";

const MAX_PAGES = 40;

/** Texto posicionado de cada página com o pdfjs (a mesma biblioteca do leitor de faturas). */
export class PdfjsStatementTextAdapter implements StatementPdfTextPort {
  async extract(fileBuffer: Buffer): Promise<PdfDocumentText | null> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    let doc;
    try {
      doc = await pdfjs.getDocument({ data: new Uint8Array(fileBuffer), verbosity: 0, isEvalSupported: false }).promise;
    } catch {
      return null;
    }
    try {
      const pages: PdfTextItem[][] = [];
      for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
        const text = await (await doc.getPage(p)).getTextContent();
        const items: PdfTextItem[] = [];
        for (const item of text.items) {
          if (!("str" in item) || !item.str.trim()) continue;
          const t = item.transform as number[];
          items.push({ x: Math.round(t[4]! * 10) / 10, y: Math.round(t[5]! * 10) / 10, str: item.str });
        }
        pages.push(items);
      }
      return { pages };
    } catch {
      return null;
    } finally {
      await doc.destroy().catch(() => undefined);
    }
  }
}
