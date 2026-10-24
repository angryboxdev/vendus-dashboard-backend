import type { PdfPageContent, PdfWord } from "../../entities/invoice-reading.js";

/** Uma linha visual da página: palavras com a mesma altura, da esquerda para a direita. */
export interface PdfRow {
  page: number;
  y: number;
  words: PdfWord[];
  text: string;
}

const Y_TOLERANCE = 2;

/** Agrupa as palavras de uma página em linhas visuais, de cima para baixo. */
export function pageRows(page: PdfPageContent): PdfRow[] {
  const sorted = [...page.words].filter((w) => w.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PdfRow[] = [];
  for (const w of sorted) {
    const row = rows.find((r) => Math.abs(r.y - w.y) <= Y_TOLERANCE);
    if (row) row.words.push(w);
    else rows.push({ page: page.number, y: w.y, words: [w], text: "" });
  }
  for (const r of rows) {
    r.words.sort((a, b) => a.x - b.x);
    r.text = r.words.map((w) => w.text).join(" ");
  }
  return rows.sort((a, b) => b.y - a.y);
}

/** Número no formato português ("1.234,56", "7,450", "3") → texto normalizado ou null. */
export const PT_NUMBER = /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/;
