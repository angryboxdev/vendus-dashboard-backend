import { readInvoice } from "../../../domain/services/reading/invoice-reader.service.js";
import { TaxCodeLinesLayout } from "../../../domain/services/reading/tax-code-lines-layout.js";
import { GenericQrLayout } from "../../../domain/services/reading/generic-qr-layout.js";
import { MakroLayout } from "../../../domain/services/reading/makro-layout.js";
import type { InvoiceLayout } from "../../../domain/services/reading/invoice-layout.js";
import type { PdfContent, PdfWord } from "../../../domain/entities/invoice-reading.js";

// Documento de pagamento FICTÍCIO de um serviço de águas: fatura da água (IVA 6 %, código (2)) e
// fatura dos resíduos (não sujeito, código (1)) na mesma página, cada uma com o seu QR.
const QR_WATER = "A:599999993*B:999999990*C:PT*D:FT*E:N*F:20261019*G:900001*H:ABCD1234-900001*I1:PT*I3:56.59*I4:3.39*N:3.39*O:59.98*Q:ab12*R:999";
const QR_WASTE = "A:599999994*B:999999990*C:PT*D:FT*E:N*F:20261019*G:900002*H:WXYZ5678-900002*I1:PT*L:30.05*N:0.00*O:30.05*Q:cd34*R:999";

/** Uma fila de palavras: [x, texto]. */
const row = (y: number, cells: [number, string][]): PdfWord[] => cells.map(([x, text]) => ({ text, x, y, width: text.length * 4 }));
const words = (text: string, x0: number) => text.split(" ").map((t, i): [number, string] => [x0 + i * 20, t]);
const line = (y: number, desc: string, qty: string, unit: string, value: string, code: string) =>
  row(y, [...words(desc, 53), [210, "2026-09-09"], [246, "2026-10-15"], [293, qty], [320, "m3"], [369, unit], [426, value], [453, code]]);

const page1: PdfWord[] = [...row(700, [[486, "Débito"], [513, "a"], [521, "partir"], [547, "de"]]), ...row(690, [[497, "2026-11-03"]])];
const page2: PdfWord[] = [
  ...row(600, [[39, "Descrição"], [210, "Período"], [365, "Valor"], [426, "Valor"], [450, "IVA"]]),
  ...row(590, [[53, "ÁGUA"], [424, "30,08"]]), // subtotal do grupo — sem código, não é linha
  ...line(580, "1 Esc. Consumo Água", "13,0000", "1,924800", "25,02", "(2)"),
  ...line(570, "B0R-Tar. Disponibilidade", "37", "0,136700", "5,06", "(2)"),
  ...line(560, "1 Esc. Saneamento", "13,0000", "1,799000", "23,39", "(2)"),
  ...line(550, "B0S-Disp Saneamento", "37", "0,066500", "2,46", "(2)"),
  ...line(540, "Taxa Recursos Hídricos Água", "13", "0,039200", "0,51", "(2)"),
  ...line(530, "Taxa Rec Hídricos Saneamento", "13", "0,011200", "0,15", "(2)"),
  ...row(520, [[53, "(2)IVA"], [76, "6%"], [210, "2026-09-09"], [246, "2026-10-15"], [293, "56,59"], [429, "3,39"]]),
  ...row(400, [[39, "Descrição"], [210, "Período"], [365, "Valor"], [426, "Valor"], [450, "IVA"]]),
  ...row(390, [[53, "RESÍDUOS"], [94, "URBANOS"], [424, "29,46"]]),
  ...line(380, "1 Esc. EA1 Resíduos Sólidos", "13,0000", "0,697600", "9,07", "(1)"),
  ...line(370, "EB5 Tarif. Dispon. Residuos", "37", "0,551100", "20,39", "(1)"),
  // Valor com uma só casa decimal, como o software do emitente imprime («0,6» = 0,60).
  ...line(360, "EA9 Tx Gestão Resíduos", "13", "0,045200", "0,6", "(1)"),
  ...row(350, [[53, "(1)IVA"], [73, "N"], [79, "Suj."], [93, "(Art.2º"], [116, "nº2"], [127, "CIVA)"], [293, "30,06"], [433, "0,0"]]),
];
const doc = (wasteQrTotal = "30.05"): PdfContent => ({
  pages: [
    { number: 1, width: 595, height: 842, words: page1 },
    { number: 2, width: 595, height: 842, words: page2 },
  ],
  qrCodes: [{ page: 2, text: QR_WATER }, { page: 2, text: QR_WASTE.replaceAll("30.05", wasteQrTotal) }],
});

describe("TaxCodeLinesLayout — documento de pagamento com 2 faturas fiscais", () => {
  test("lê as linhas das duas faturas (sem subtotais), códigos → taxas da legenda, vencimento do débito", () => {
    const r = readInvoice(doc("30.06"), [new MakroLayout(), new TaxCodeLinesLayout(), new GenericQrLayout()]);
    expect(r.layout).toBe("layout:tax-code-lines");
    expect(r.lines.map((l) => [l.description, l.quantityText, l.unitPriceText, l.grossCents, l.vatRate])).toEqual([
      ["1 Esc. Consumo Água", "13,0000", "1,924800", 2502, "6"],
      ["B0R-Tar. Disponibilidade", "37", "0,136700", 506, "6"],
      ["1 Esc. Saneamento", "13,0000", "1,799000", 2339, "6"],
      ["B0S-Disp Saneamento", "37", "0,066500", 246, "6"],
      ["Taxa Recursos Hídricos Água", "13", "0,039200", 51, "6"],
      ["Taxa Rec Hídricos Saneamento", "13", "0,011200", 15, "6"],
      ["1 Esc. EA1 Resíduos Sólidos", "13,0000", "0,697600", 907, "0"],
      ["EB5 Tarif. Dispon. Residuos", "37", "0,551100", 2039, "0"],
      ["EA9 Tx Gestão Resíduos", "13", "0,045200", 60, "0"],
    ]);
    expect(r.header.dueDate).toBe("2026-11-03");
  });

  test("confere com a SOMA dos dois QR: fecha ao cêntimo (IVA arredondado linha a linha → aviso)", () => {
    const r = readInvoice(doc("30.06"), [new MakroLayout(), new TaxCodeLinesLayout(), new GenericQrLayout()]);
    expect(r.status).toBe("ready");
    expect(r.totals).toMatchObject({ netCents: 8665, totalCents: 9004 });
    expect(r.qr?.documentNumber).toBe("900001");
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["qr_multiple_documents", "vat_rounded_per_line"]));
  });

  test("linhas que não fecham com os QR → não é aceite (estrito)", () => {
    const r = readInvoice(doc("30.05"), [new TaxCodeLinesLayout()]);
    expect(r.status).toBe("needs_attention");
    expect(r.issues.some((i) => i.code === "amounts_not_reconciled" && i.blocking)).toBe(true);
  });
});

describe("readInvoice — layout estrito que não fecha dá a vez ao seguinte", () => {
  const content = doc("30.06");
  const failing: InvoiceLayout = {
    id: "layout:falha",
    strict: true,
    detect: () => true,
    parse: () => ({ header: { supplierName: null, documentNumber: null, atcud: null, issuerNif: null, buyerNif: null, issueDate: null }, lines: [], discounts: [], footer: { discountTotalCents: null, itemCountText: null, depositCountText: null, netTotalCents: null, depositTotalCents: null, vatTable: [], totalCents: null }, carried: [], issues: [{ code: "no_lines", blocking: true, detail: "x" }] }),
  };

  test("o seguinte que reconhece o documento lê-o", () => {
    const r = readInvoice(content, [failing, new TaxCodeLinesLayout()]);
    expect(r.layout).toBe("layout:tax-code-lines");
    expect(r.status).toBe("ready");
  });

  test("sem outro que o reconheça, fica a leitura do primeiro (com os problemas)", () => {
    const r = readInvoice(content, [failing]);
    expect(r.layout).toBe("layout:falha");
    expect(r.status).toBe("needs_attention");
  });
});
