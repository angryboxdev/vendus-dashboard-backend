import { readInvoice } from "../../../domain/services/reading/invoice-reader.service.js";
import { GenericQrLayout } from "../../../domain/services/reading/generic-qr-layout.js";
import { MakroLayout } from "../../../domain/services/reading/makro-layout.js";
import type { PdfContent, PdfWord } from "../../../domain/entities/invoice-reading.js";
import { syntheticMakro } from "./synthetic-makro.js";
import { syntheticDreamPlus } from "./synthetic-dream-plus.js";

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

  const simple = (rows: [string, string, string, string][], qr: string) =>
    readInvoice({
      pages: [page(1, [
        row(500, [[40, "Descrição"], [300, "Qtd."], [360, "Preço Unitário"], [450, "IVA"], [520, "Valor"]]),
        ...rows.map(([d, q, u, v], i) => row(480 - i * 12, [[40, d], [300, q], [360, u], [450, "23%"], [520, v]])),
        row(300, [[40, "Total"], [520, "x"]]),
      ])],
      qrCodes: [{ page: 1, text: qr }],
    }, layouts);

  test("nota de crédito com linhas a negativo: valores em absoluto (o QR já diz que é crédito)", () => {
    const r = simple([["Devolução A", "1", "-50,00", "-50,00"], ["Devolução B", "2", "-10,00", "-20,00"]],
      "A:599999993*B:999999990*C:PT*D:NC*E:N*F:20260801*G:NC A/1*H:ABCD-3*I1:PT*I7:70.00*I8:16.10*N:16.10*O:86.10*Q:ab12*R:1");
    expect(r.status).toBe("ready");
    expect(r.lines.map((l) => l.netCents)).toEqual([5000, 2000]);
  });

  test("preços com IVA incluído (retalho): bases repartidas a partir da base do QR, com aviso", () => {
    // 36,99 + 19,29 = 56,28 com IVA; base do QR 45,76 (as bases impressas por linha somariam 45,75).
    const r = simple([["Ventoinha", "1", "36,99", "36,99"], ["Banco", "1", "19,29", "19,29"]],
      "A:599999993*B:999999990*C:PT*D:FS*E:N*F:20260613*G:FS B/1*H:ABCD-4*I1:PT*I7:45.76*I8:10.52*N:10.52*O:56.28*Q:ab12*R:1");
    expect(r.status).toBe("ready");
    expect(r.lines.reduce((a, l) => a + l.netCents, 0)).toBe(4576);
    expect(r.issues.map((i) => i.code)).toContain("line_bases_from_vat_inclusive");
  });

  test("autoliquidação: grupo tributado com IVA 0 € no QR → taxa 0% com aviso; milhares com espaço lidos inteiros", () => {
    const p = page(1, [
      row(548, [[19, "Nº"], [89, "Descrição"], [218, "Qtd."], [304, "Preço Unitário"], [460, "% IVA"], [529, "Valor"]]),
      row(529, [[19, "800257"], [230, "1"], [324, "11 520,00"], [478, "23"], [515, "11 520,00"]]),
      row(514, [[89, "Pavimento (fornecimento e instalação, 50% da proposta)"]]),
      row(473, [[19, "Especificação do Imposto"], [429, "Total EUR Excl. IVA"], [525, "11 520,00"]]),
    ]);
    const r = readInvoice({ pages: [p], qrCodes: [{ page: 1, text: "A:599999993*B:999999990*C:PT*D:FT*E:N*F:20251112*G:FT P/1*H:ABCD-5*I1:PT*I7:11520.00*N:0.00*O:11520.00*Q:ab12*R:1" }] }, layouts);
    expect(r.status).toBe("ready");
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ netCents: 1152000, vatRate: "0" });
    expect(r.lines[0]!.description).toContain("50% da proposta");
    expect(r.issues.find((i) => i.code === "qr_vat_zero_in_taxed_band")).toMatchObject({ blocking: false });
  });

  test("sem QR o leitor genérico não se aplica (vai para a IA); Makro continua no leitor próprio", () => {
    expect(readInvoice({ ...service(), qrCodes: [] }, layouts).status).toBe("unsupported");
    const m = readInvoice(syntheticMakro(), layouts);
    expect(m).toMatchObject({ layout: "layout:makro", status: "ready" });
  });
});

describe("Dream Plus FT 56892 (formato PHC; task embalagens/conversões P0)", () => {
  test("lê as 3 linhas sem IA: 4,000 = 4 (não 4000), descontos %, Qt/Cx ignorado, quadro de IVA não é artigo, fecha 206,87 €", () => {
    const r = readInvoice(syntheticDreamPlus(), layouts);
    expect(r.layout).toBe("layout:generic-qr");
    expect(r.status).toBe("ready");
    expect(r.lines.map((l) => [l.quantityText, l.unitPriceText, l.grossCents, l.lineDiscountCents ?? 0, l.vatCode])).toEqual([
      ["5,000", "8,20", 4100, 205, "6"],
      ["20,000", "6,20", 12400, 1240, "6"],
      ["4,000", "10,68", 4272, 427, "23"],
    ]);
    expect(r.totals).toMatchObject({ netCents: 18900, totalCents: 20687 });
    // Descrição completa (o texto começa antes do título «Designação»), sem o lote nem a menção legal.
    expect(r.lines.map((l) => l.description)).toEqual(["Q. Cheddar Ralado kg", "Q. Mozzarella ralado 100% Eurial kg", "Tomate Mutti p/ Pizza Classico 5 kg bolsa"]);
    expect(r.header.supplierName).toBe("Fornecedor Teste - Comércio e Distribuição Produtos Alimentares Lda");
    // Referência do fornecedor (não o n.º de ordem «0/4/8» impresso à esquerda).
    expect(r.lines.map((l) => l.supplierCode)).toEqual(["020051000R", "44641004", "8005110551383"]);
    expect(codes(r).filter((c) => c !== "vat_rounded_per_line")).toEqual([]);
  });

  test("Qt/Cx é logístico: nunca é a coluna da quantidade", () => {
    const r = readInvoice(syntheticDreamPlus(), layouts);
    expect(r.lines.every((l) => l.quantityText !== "2")).toBe(true);
  });
});
