import type { PdfContent, PdfWord } from "../../entities/invoice-reading.js";
import { pageRows } from "./pdf-rows.js";

/**
 * Prazo de pagamento impresso no documento, como YYYY-MM-DD: procura a etiqueta («Data limite de
 * pagamento», «Débito a partir de»…) e a data à direita na mesma linha ou por baixo, na coluna da
 * etiqueta (até 3 linhas: noutras colunas pode haver texto intercalado). Aceita «15/10/2026»,
 * «2026-10-15» e «15 setembro 2026».
 */

const DUE_LABEL = /^(d[ée]bito a partir de|data limite( de)?( pagamento)?|data de vencimento|pagar at[ée])\b/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PT_DATE = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const ROWS_BELOW = 3;
const COLUMN_TOLERANCE = 80;

function dateAt(ws: PdfWord[], i: number): string | null {
  const t = ws[i]!.text;
  if (ISO_DATE.test(t)) return t;
  const pt = PT_DATE.exec(t);
  if (pt) return `${pt[3]}-${pt[2]}-${pt[1]}`;
  const month = MONTHS.indexOf(ws[i + 1]?.text.toLowerCase() ?? "");
  const year = ws[i + 2]?.text ?? "";
  if (/^\d{1,2}$/.test(t) && month >= 0 && /^\d{4}$/.test(year)) return `${year}-${String(month + 1).padStart(2, "0")}-${t.padStart(2, "0")}`;
  return null;
}

function firstDate(ws: PdfWord[]): string | null {
  for (let i = 0; i < ws.length; i++) {
    const d = dateAt(ws, i);
    if (d) return d;
  }
  return null;
}

export function dueDateOf(content: PdfContent): string | null {
  for (const page of content.pages) {
    const rows = pageRows(page);
    for (let i = 0; i < rows.length; i++) {
      const ws = rows[i]!.words;
      const at = ws.findIndex((_, j) => DUE_LABEL.test(ws.slice(j, j + 4).map((w) => w.text).join(" ")));
      if (at < 0) continue;
      const x0 = ws[at]!.x;
      const sameRow = firstDate(ws.slice(at + 1));
      if (sameRow) return sameRow;
      for (const below of rows.slice(i + 1, i + 1 + ROWS_BELOW)) {
        const d = firstDate(below.words.filter((w) => Math.abs(w.x - x0) < COLUMN_TOLERANCE));
        if (d) return d;
      }
    }
  }
  return null;
}
