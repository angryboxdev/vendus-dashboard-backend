/** Texto de um PDF com a posição de cada bloco (pontos PDF; y cresce para cima), página a página. */
export interface PdfTextItem {
  x: number;
  y: number;
  str: string;
}

export interface PdfDocumentText {
  pages: PdfTextItem[][];
}

/** Uma linha visual: blocos com o mesmo y (± tolerância), da esquerda para a direita. */
export interface PdfLine {
  y: number;
  items: PdfTextItem[];
  text: string;
}

/**
 * Agrupa os blocos de uma página em linhas visuais, de cima para baixo. A tolerância junta o que o
 * PDF desenha a 1–2 pt de distância na mesma linha (no Millennium a descrição fica 1 pt acima dos
 * valores do mesmo movimento).
 */
export function groupLines(items: PdfTextItem[], tolerance = 2.5): PdfLine[] {
  const sorted = items.filter((i) => i.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: PdfTextItem[] }[] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) <= tolerance) last.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines.map((l) => {
    const ordered = [...l.items].sort((a, b) => a.x - b.x);
    return { y: l.y, items: ordered, text: ordered.map((i) => i.str.trim()).join(" ") };
  });
}

/** Todo o texto do documento, linha a linha (para detetar o modelo e ler metadados). */
export function documentLines(doc: PdfDocumentText): PdfLine[][] {
  return doc.pages.map((p) => groupLines(p));
}
