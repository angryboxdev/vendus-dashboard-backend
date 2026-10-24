import type { PdfContent, PdfPageContent, PdfWord } from "../../../domain/entities/invoice-reading.js";

/**
 * Fatura sintética no layout Makro (dados fictícios; só o formato é real).
 * Cobre: código com zeros à esquerda, MOT desalinhado (sob «DD»), fator PR Unit/KG × Unit/KG,
 * depósito «0 D» ligado ao artigo anterior, anotação IEC, página de continuação sem cabeçalho,
 * valor a transportar e arredondamento do IVA por taxa (linha a linha 0,16 ≠ quadro 0,15).
 */

const CHAR = 4.2;
type Cell = [x: number, text: string];

/** Uma linha visual: cada célula é um item do PDF, partido em palavras como faz o adapter. */
function row(y: number, cells: Cell[]): PdfWord[] {
  return cells.flatMap(([x, text]) => [...text.matchAll(/\S+/g)].map((m) => ({ text: m[0], x: x + m.index! * CHAR, y, width: m[0].length * CHAR })));
}

const item = (y: number, code: string, desc: string, pack: string, base: string, factor: string, uv: string, qty: string, total: string, vat: string, extra: Cell[] = []) =>
  row(y, [[35, code], [100, desc], [269, pack], [302, base], [361, factor], [395, uv], [438, qty], [468, total], [497, vat], ...extra]);

export const QR =
  "A:502030712*B:999999990*C:PT*D:FT*E:N*F:20261018*G:FAC 0001/000001*H:ABCD1234-000001*I1:PT*I2:8.40*I3:2.50*I4:0.15*I7:56.57*I8:13.01*N:13.16*O:80.63*Q:ab12*R:9999";

export interface SyntheticOptions {
  qr?: string | null;
  /** Substitui linhas da página 2 (rodapé incluído). */
  page2?: PdfWord[][];
  lineCTotal?: string;
  lineAVat?: string;
}

const header = (page: number): PdfWord[][] => [
  row(749, [[23, "MAKRO CASH & CARRY PORTUGAL, S.A."], [513, `Pág: ${page}/2`]]),
  row(738, [[23, "Nº Contribuinte: 502030712"], [420, "Data da venda"], [509, "18-10-2026 13:07"]]),
  row(714, [[408, "ATCUD: ABCD1234-000001"]]),
  row(696, [[23, "Capital social: 1.000.000,00 EUR"]]),
  row(590, [[23, "Factura Nº FAC 0001/000001"]]),
  row(549, [[23, "CLIENTE TESTE LDA"], [300, "Nº cliente: 1 234"]]),
];

export const defaultPage2 = (): PdfWord[][] => [
  item(530, "084854", "ARTIGO D TESTE", "BX", "1,250", "1", "1,25", "1", "1,25", "4"),
  row(500, [[99, "Leve Mais Pague Menos"], [474, "0,60"], [496, "2"], [517, "11111"]]),
  row(490, [[387, "Desconto Total"], [474, "0,60"]]),
  row(470, [[23, "Nº de artigos: 9"], [133, "Peso Total: 0,000 KG"], [255, "Depósito: 3"], [396, "Total s/ IVA:"], [468, "67,47"]]),
  row(460, [[390, "Total Deposito:"], [470, "8,40"]]),
  row(440, [[375, "Valor liq."], [430, "Taxa IVA"], [480, "Valor IVA"]]),
  row(430, [[383, "56,57"], [416, "2=23,00%"], [475, "13,01"]]),
  row(420, [[387, "2,50"], [416, "4= 6,00%"], [479, "0,15"]]),
  row(410, [[387, "8,40"], [416, "0= 0,00%"], [479, "0,00"]]),
  row(390, [[368, "Valor Total"], [468, "80,63"]]),
  row(300, [[23, "Ident. TPA: 0000000"]]),
  row(290, [[23, "COMPRA 80,63€"]]),
];

export function syntheticMakro(opts: SyntheticOptions = {}): PdfContent {
  const page1: PdfWord[][] = [
    ...header(1),
    row(509, [[23, "M"], [35, "Código Artigo"], [100, "Descrição Artigo"], [261, "PACK"], [286, "PR Unit/KG"], [337, "Unit/KG"], [375, "Preço U.V."], [422, "Quant"], [451, "Val.total"], [497, "IVA"], [521, "DD"], [540, "DP"], [558, "MOT"]]),
    item(481, "0001234567890", "ARTIGO A TESTE 1KG", "PC", "2,00", "1", "2,00", "6", "12,00", opts.lineAVat ?? "2", [[515, "11111"]]),
    row(471, [[23, "M"], ...item(0, "042308", "ARTIGO B TESTE", "CA", "1,250", "1", "1,25", "1", "1,25", "4", [[540, "P"]]).map((w) => [w.x, w.text] as Cell)]),
    item(461, "138646", "ARTIGO C TESTE 3KG", "BX", "22,585", "2", "45,17", "1", opts.lineCTotal ?? "45,17", "2"),
    row(451, [[23, "+"], [30, "95"], [100, "TAXA IEC INCL. PREÇO U.V"], [240, "0,304"], [265, "*"], [300, "1"], [315, "="], [336, "0,30"]]),
    row(441, [[23, "+ 165632"], [100, "DEPOSITO 28 X 0.10 EUR"], [269, "PC"], [302, "2,800"], [361, "1"], [395, "2,80"], [438, "3"], [468, "8,40"], [497, "0 D"]]),
    row(420, [[324, "Valor a transportar S/IVA:"], [471, "66,82"]]),
  ];
  const page2 = [...header(2), ...(opts.page2 ?? defaultPage2())];
  const toPage = (n: number, rows: PdfWord[][]): PdfPageContent => ({ number: n, width: 595, height: 842, words: rows.flat() });
  return {
    pages: [toPage(1, page1), toPage(2, page2)],
    qrCodes: opts.qr === null ? [] : [{ page: 1, text: "https://example.test/nao-fiscal" }, { page: 1, text: opts.qr ?? QR }],
  };
}
