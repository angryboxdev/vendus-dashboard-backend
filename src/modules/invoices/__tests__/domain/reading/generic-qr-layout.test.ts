import { readInvoice } from "../../../domain/services/reading/invoice-reader.service.js";
import { GenericQrLayout } from "../../../domain/services/reading/generic-qr-layout.js";
import { MakroLayout } from "../../../domain/services/reading/makro-layout.js";
import type { PdfContent, PdfWord } from "../../../domain/entities/invoice-reading.js";
import { syntheticMakro } from "./synthetic-makro.js";

/** Faturas sintéticas (valores fictícios) com os formatos reais que o leitor genérico tem de ler. */
const CHAR = 4.4;
type Cell = [x: number, text: string];
const row = (y: number, cells: Cell[]): PdfWord[] => cells.flatMap(([x, t]) => [...t.matchAll(/\S+/g)].map((m) => ({ text: m[0], x: x + m.index! * CHAR, y, width: m[0].length * CHAR })));
const page = (n: number, rows: PdfWord[][]) => ({ number: n, width: 595, height: 842, words: rows.flat() });
const layouts = [new MakroLayout(), new GenericQrLayout()];
const codes = (r: ReturnType<typeof readInvoice>) => r.issues.map((i) => i.code);

// Formato «InvoiceXpress» (caso CPF/2530): Quant. | Descrição | Filial | Total s/ IVA | IVA% | Valor.
const servicePage = (n: number, copy: string) =>
  page(n, [
    row(692, [[31, copy]]),
    row(668, [[34, "FATURA N.º: CPF/9999"]]),
    row(120, [[461, "ATCUD:ABCD1234-9999"]]),
    row(113, [[45, "EMPRESA SERVIÇOS TESTE, UNIPESSOAL LDA. Registada na C.R.C."]]),
    row(104, [[94, "NIPC: 599 999 993. Capital Social de 5.000,00€."]]),
    row(472, [[39, "Quant."], [76, "Descrição"], [280, "Filial"], [372, "Total s/ IVA"], [446, "IVA%"], [536, "Valor"]]),
    row(454, [[75, "Loja Teste"]]),
    row(443, [[75, "Fatura do 22 de Outubro de 2026 ao 21 de"]]),
    row(433, [[51, "4"], [75, "Outubro de 2027."], [279, "Loja Teste"], [387, "190,00 €"], [452, "23%"], [524, "233,70 €"]]),
    row(422, [[75, "Desratização / Manutenção"]]),
    row(391, [[385, "190,00 €"], [438, "43,70 €"]]),
    row(389, [[225, "TOTAL:"], [507, "233,70 €"]]),
    row(298, [[37, "D. vencimento"], [140, "Valor"]]),
    row(265, [[51, "21/11/2026"], [129, "233,70 €"]]),
  ]);
const SERVICE_QR = "A:599999993*B:999999990*C:PT*D:FT*E:N*F:20261022*G:FT CPF/9999*H:ABCD1234-9999*I1:PT*I7:190.00*I8:43.70*N:43.70*O:233.70*Q:ab12*R:192";
const service = (qr = SERVICE_QR): PdfContent => ({ pages: [servicePage(1, "ORIGINAL"), servicePage(2, "DUPLICADO")], qrCodes: [{ page: 1, text: qr }] });

describe("leitor genérico — qualquer fatura com QR fiscal", () => {
  test("CPF/2530: original + duplicado = 1 documento, 1 linha, qtd 4, total da linha 190,00 (não 4 × 190), vencimento lido", () => {
    const r = readInvoice(service(), layouts);
    expect(r.layout).toBe("layout:generic-qr");
    expect(r.status).toBe("ready");
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ quantityText: "4", unitPriceText: null, grossCents: 19000, netCents: 19000, vatRate: "23" });
    expect(r.lines[0]!.description).toBe("Loja Teste Fatura do 22 de Outubro de 2026 ao 21 de Outubro de 2027. Desratização / Manutenção");
    expect(r.totals).toMatchObject({ netCents: 19000, vatCents: 4370, totalCents: 23370 });
    expect(r.header).toMatchObject({ documentNumber: "FT CPF/9999", atcud: "ABCD1234-9999", dueDate: "2026-11-21", supplierName: "EMPRESA SERVIÇOS TESTE, UNIPESSOAL LDA" });
  });

  test("nenhuma coluna das linhas fecha com a base do QR → recusa (estrito), nunca escolhe ao acaso", () => {
    const r = readInvoice(service(SERVICE_QR.replace("I7:190.00*I8:43.70*N:43.70*O:233.70", "I7:200.00*I8:46.00*N:46.00*O:246.00")), layouts);
    expect(r.status).toBe("needs_attention");
    expect(r.lines).toEqual([]);
  });

  test("taxa de IVA do QR só aceite se base × taxa = IVA declarado", () => {
    const r = readInvoice(service(SERVICE_QR.replace("I8:43.70*N:43.70*O:233.70", "I8:41.00*N:41.00*O:231.00")), layouts);
    expect(r.status).toBe("needs_attention");
    expect(r.lines).toEqual([]);
  });

  test("cabeçalho em duas linhas, preço «Prec», resumo de IVA por baixo e desconto negativo", () => {
    const p = page(1, [
      row(449, [[31, "N°"], [75, "Designação"], [230, "Quant."], [315, "Prec"], [396, "Total"], [430, "Taxa"], [518, "Importancia"]]),
      row(438, [[315, "unid. SI"], [402, "SI"], [432, "IVA"], [530, "C/IVA"]]),
      row(416, [[32, "1"], [75, "PARAFUSO TESTE 6X40"], [241, "2"], [328, "3.50"], [406, "7.00"], [433, "23.00"], [556, "8.61"]]),
      row(396, [[32, "2"], [75, "ESQUADRO TESTE"], [241, "1"], [328, "5.00"], [406, "5.00"], [433, "23.00"], [556, "6.15"]]),
      row(376, [[32, "3"], [75, "DESCONTO COMERCIAL"], [406, "-2.00"], [433, "23.00"], [556, "-2.46"]]),
      row(366, [[75, "SUBTOTAL"], [406, "10.00"]]),
      row(260, [[264, "TVA 23.00%"], [354, "10.00 EUR"], [444, "2.30 EUR"], [530, "12.30 EUR"]]),
    ]);
    const r = readInvoice({ pages: [p], qrCodes: [{ page: 1, text: "A:599999993*B:999999990*C:PT*D:FS*E:N*F:20260829*G:FS 1/1*H:ABCD-1*I1:PT*I7:10.00*I8:2.30*N:2.30*O:12.30*Q:ab12*R:1" }] }, layouts);
    expect(r.status).toBe("ready");
    expect(r.lines.map((l) => [l.quantityText, l.unitPriceText, l.grossCents, l.discountCents, l.netCents])).toEqual([["2", "3.50", 700, 117, 583], ["1", "5.00", 500, 83, 417]]);
    expect(codes(r)).toEqual(["discount_without_reference"]);
  });

  test("emitente que arredonda o IVA linha a linha: aceite com aviso de ajuste de arredondamento", () => {
    const p = page(1, [
      row(500, [[40, "Descrição"], [300, "Quant."], [360, "Valor s/ IVA"], [450, "IVA"], [520, "Total"]]),
      row(480, [[40, "Taxa de serviço"], [300, "1"], [360, "267,89"], [450, "23%"], [520, "329,50"]]),
      row(470, [[40, "Taxa de publicidade"], [300, "1"], [360, "43,23"], [450, "23%"], [520, "53,17"]]),
      row(440, [[40, "Total"], [520, "382,67"]]),
    ]);
    // Por taxa: 311,12 × 23% = 71,56; linha a linha: 61,61 + 9,94 = 71,55 (o que o QR declara).
    const r = readInvoice({ pages: [p], qrCodes: [{ page: 1, text: "A:599999993*B:999999990*C:PT*D:FT*E:N*F:20260401*G:FT U/1*H:ABCD-2*I1:PT*I7:311.12*I8:71.55*N:71.55*O:382.67*Q:ab12*R:1" }] }, layouts);
    expect(r.status).toBe("ready");
    expect(codes(r)).toEqual(["vat_rounded_per_line"]);
    expect(r.issues[0]!.blocking).toBe(false);
  });

  test("QR com o campo L igual ao total (erro do emissor) → L ignorado com aviso", () => {
    const r = readInvoice(service(SERVICE_QR.replace("N:43.70", "L:233.70*N:43.70")), layouts);
    expect(r.status).toBe("ready");
    expect(r.issues.find((i) => i.code === "qr_totals_inconsistent")).toMatchObject({ blocking: false });
  });

  test("sem QR o leitor genérico não se aplica (vai para a IA); Makro continua no leitor próprio", () => {
    expect(readInvoice({ ...service(), qrCodes: [] }, layouts).status).toBe("unsupported");
    const m = readInvoice(syntheticMakro(), layouts);
    expect(m).toMatchObject({ layout: "layout:makro", status: "ready" });
  });
});
