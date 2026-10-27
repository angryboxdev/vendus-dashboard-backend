import { readInvoice } from "../../../domain/services/reading/invoice-reader.service.js";
import { RateLinesLayout } from "../../../domain/services/reading/rate-lines-layout.js";
import { TaxCodeLinesLayout } from "../../../domain/services/reading/tax-code-lines-layout.js";
import { GenericQrLayout } from "../../../domain/services/reading/generic-qr-layout.js";
import { MakroLayout } from "../../../domain/services/reading/makro-layout.js";
import type { PdfContent, PdfWord } from "../../../domain/entities/invoice-reading.js";

const LAYOUTS = () => [new MakroLayout(), new TaxCodeLinesLayout(), new RateLinesLayout(), new GenericQrLayout()];

/** Uma fila de palavras: [x, texto]. */
const row = (y: number, cells: [number, string][]): PdfWord[] => cells.map(([x, text]) => ({ text, x, y, width: text.length * 4 }));
const words = (text: string, x0: number) => text.split(" ").map((t, i): [number, string] => [x0 + i * 15, t]);
const doc = (words: PdfWord[], qr: string): PdfContent => ({ pages: [{ number: 1, width: 595, height: 842, words }], qrCodes: [{ page: 1, text: qr }] });

describe("RateLinesLayout — taxa seguida do valor (eletricidade, formato Alfa Energia)", () => {
  // Fatura FICTÍCIA: 23 % (base 124,00, IVA 28,52) e 6 % (base 2,90, IVA 0,17).
  const QR = "A:599999995*B:999999990*C:PT*D:FT*E:N*F:20260930*G:FT X/1*H:ABCD1234-1*I1:PT*I3:2.90*I4:0.17*I7:124.00*I8:28.52*N:28.69*O:155.59*Q:ab12*R:999";
  const line = (y: number, desc: string, qty: [number, string][], unit: string, rate: string, value: string) =>
    row(y, [...words(desc, 60), [220, "24/08/2026"], [260, "23/09/2026"], ...qty, [370, "kWh"], [400, unit], [450, rate], [480, value], [510, "€"]]);
  const content = doc(
    [
      ...row(780, [[350, "DATA"], [375, "LIMITE"], [405, "PAGAMENTO"]]),
      ...row(770, [[72, "Sem"], [88, "Ciclo"]]), // outra coluna intercalada entre a etiqueta e a data
      ...row(760, [[350, "15/10/2026"]]),
      ...row(700, [[60, "Descrição"], [220, "Período"], [330, "Quantidade"], [400, "Preço"], [450, "IVA"], [480, "Valor"]]),
      ...line(690, "20,7 kVA - Potência Contratada", [[330, "30,00"]], "0,800000", "23%", "24,00"),
      { text: "DETALHE", x: 20, y: 690, width: 30, rotated: true }, // rótulo vertical na margem
      ...line(680, "Consumo medido em Simples", [[325, "1"], [333, "000,00"]], "0,100000", "23%", "100,00"),
      ...line(670, "Contribuição AudioVisual 2,85 € x 12 meses /", [[330, "31,00"]], "0,093548", "6%", "2,90"),
      ...row(660, [[60, "Total"], [80, "Energia:"], [480, "126,90"], [510, "€"]]),
      ...row(650, [[60, "IVA(23%)"], [480, "28,52"], [510, "€"]]),
    ],
    QR,
  );

  test("lê as linhas (descrição com números, milhares com espaço, sem texto rodado) e o prazo", () => {
    const r = readInvoice(content, LAYOUTS());
    expect(r.layout).toBe("layout:rate-lines");
    expect(r.lines.map((l) => [l.description, l.quantityText, l.unitPriceText, l.grossCents, l.vatRate])).toEqual([
      ["20,7 kVA - Potência Contratada", "30,00", "0,800000", 2400, "23"],
      ["Consumo medido em Simples", "1000,00", "0,100000", 10000, "23"],
      ["Contribuição AudioVisual 2,85 € x 12 meses /", "31,00", "0,093548", 290, "6"],
    ]);
    expect(r.header.dueDate).toBe("2026-10-15");
  });

  test("fecha ao cêntimo com o QR", () => {
    const r = readInvoice(content, LAYOUTS());
    expect(r.status).toBe("ready");
    expect(r.totals).toMatchObject({ netCents: 12690, vatCents: 2869, totalCents: 15559 });
  });

  test("valores que não fecham com o QR → não aceita (estrito)", () => {
    const r = readInvoice({ ...content, qrCodes: [{ page: 1, text: QR.replace("I7:124.00*I8:28.52*N:28.69*O:155.59", "I7:130.00*I8:29.90*N:30.07*O:162.97") }] }, LAYOUTS());
    expect(r.status).not.toBe("ready");
  });
});

describe("RateLinesLayout — valor seguido da taxa e do código (formato Endesa)", () => {
  // Fatura FICTÍCIA: 23 % (base 13,00 = 18,00 − desconto de boas-vindas 5,00; IVA 2,99) e 6 % (base 2,00; IVA 0,12).
  const QR = "A:599999996*B:999999990*C:PT*D:FT*E:N*F:20260831*G:FAC 1/1*H:WXYZ5678-1*I1:PT*I3:2.00*I4:0.12*I7:13.00*I8:2.99*N:3.11*O:18.11*Q:cd34*R:999";
  const content = doc(
    [
      ...row(780, [[55, "Data"], [80, "Limite"], [115, "de"], [130, "Pagamento"], [177, "15"], [193, "setembro"], [240, "2026"]]),
      ...row(700, [[44, "Descrição"], [192, "Quantidade"], [265, "Preço"], [395, "Total"], [416, "valor"], [554, "IVA"]]),
      ...row(690, [...words("Termo de Potência (6.90 kVA)", 41), [200, "32"], [212, "dias"], [251, "0,700000€/dia"], [321, "[0,562500€/dia]"], [403, "22,40"], [427, "€"], [453, "-4,40"], [478, "€"], [516, "18,00"], [539, "€"], [546, "23%"], [561, "(c)"]]),
      ...row(680, [[64, "*"], [70, "Desconto"], [99, "Fatura"], [122, "Digital"], [147, "(22,40"], [167, "€"], [173, "x"], [180, "1,00%)"]]),
      ...row(670, [...words("Termo de Energia", 41), [195, "1.000"], [214, "kWh"], [248, "0,002000€/kWh"], [405, "2,00"], [424, "€"], [520, "2,00"], [539, "€"], [549, "6%"], [560, "(b)"]]),
      ...row(660, [...words("Desconto de boas-vindas", 41), [205, "1,00"], [253, "-5,000000€"], [401, "-5,00"], [429, "€"], [511, "-5,00"], [538, "€"], [545, "23%"], [561, "(c)"]]),
      // Resumo do IVA: a taxa está na coluna da descrição → nunca é linha.
      ...row(640, [[58, "(c)"], [73, "IVA"], [87, "23%"], [200, "13,00"], [224, "€"], [405, "2,99"], [424, "€"]]),
      ...row(630, [[58, "(b)"], [72, "IVA"], [87, "6%"], [202, "2,00"], [222, "€"], [405, "0,12"], [424, "€"]]),
    ],
    QR,
  );

  test("bruto e desconto da linha, preço com unidade, linha negativa como desconto do documento", () => {
    const r = readInvoice(content, LAYOUTS());
    expect(r.layout).toBe("layout:rate-lines");
    expect(r.lines.map((l) => [l.description, l.quantityText, l.unitPriceText, l.grossCents, l.vatRate])).toEqual([
      ["Termo de Potência (6.90 kVA)", "32", "0,700000", 2240, "23"],
      ["Termo de Energia", "1000", "0,002000", 200, "6"], // milhares com ponto
    ]);
    // Desconto da linha (4,40) + desconto de boas-vindas (5,00) na única linha a 23 %.
    expect(r.lines[0]).toMatchObject({ discountCents: 940, netCents: 1300 });
    expect(r.issues.map((i) => i.code)).toContain("discount_without_reference");
    expect(r.header.dueDate).toBe("2026-09-15");
  });

  test("fecha ao cêntimo com o QR", () => {
    const r = readInvoice(content, LAYOUTS());
    expect(r.status).toBe("ready");
    expect(r.totals).toMatchObject({ netCents: 1500, vatCents: 311, totalCents: 1811 });
  });
});
