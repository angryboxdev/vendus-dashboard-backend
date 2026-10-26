import type { ParsedBankStatement, StatementTemplateId } from "./parsed-statement.js";
import type { PdfDocumentText } from "./pdf-text.js";
import { isMillenniumStatement, parseMillenniumStatement } from "./millennium-pdf.parser.js";

/** Um modelo de extrato em PDF: reconhece o layout e lê-o. Um banco novo = uma entrada nova aqui. */
export interface StatementPdfTemplate {
  id: StatementTemplateId;
  label: string;
  matches(doc: PdfDocumentText): boolean;
  parse(doc: PdfDocumentText): ParsedBankStatement;
}

export const STATEMENT_PDF_TEMPLATES: StatementPdfTemplate[] = [
  { id: "millennium_pdf", label: "Millennium BCP — Extrato Combinado (PDF)", matches: isMillenniumStatement, parse: parseMillenniumStatement },
];

/** Camada 1 (classificar o modelo) + camada 2 (ler por regras). `null` = layout desconhecido. */
export function parseStatementPdf(doc: PdfDocumentText, templates: StatementPdfTemplate[] = STATEMENT_PDF_TEMPLATES): ParsedBankStatement | null {
  const template = templates.find((t) => t.matches(doc));
  return template ? template.parse(doc) : null;
}
