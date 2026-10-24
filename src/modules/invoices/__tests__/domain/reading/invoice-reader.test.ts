import { readInvoice } from "../../../domain/services/reading/invoice-reader.service.js";
import { MakroLayout } from "../../../domain/services/reading/makro-layout.js";
import type { PdfWord } from "../../../domain/entities/invoice-reading.js";
import { defaultPage2, QR, syntheticMakro } from "./synthetic-makro.js";

const layouts = [new MakroLayout()];
const codes = (r: ReturnType<typeof readInvoice>) => r.issues.map((i) => i.code);
const w = (y: number, x: number, text: string): PdfWord[] => [...text.matchAll(/\S+/g)].map((m) => ({ text: m[0], x: x + m.index! * 4.2, y, width: m[0].length * 4.2 }));

describe("leitor determinístico — layout Makro", () => {
  test("lê todas as linhas, aplica o desconto MOT uma vez e reconcilia ao cêntimo com o QR", () => {
    const r = readInvoice(syntheticMakro(), layouts);
    expect(r.status).toBe("ready");
    expect(r.issues).toEqual([]);
    expect(r.layout).toBe("layout:makro");
    expect(r.header).toMatchObject({ issuerNif: "502030712", documentNumber: "FAC 0001/000001", atcud: "ABCD1234-000001", issueDate: "2026-10-18" });
    expect(r.lines.map((l) => [l.page, l.kind, l.supplierCode, l.grossCents, l.discountCents, l.netCents, l.vatCode, l.vatRate])).toEqual([
      [1, "product", "0001234567890", 1200, 60, 1140, "2", "23"],
      [1, "product", "042308", 125, 0, 125, "4", "6"],
      [1, "product", "138646", 4517, 0, 4517, "2", "23"],
      [1, "deposit", "165632", 840, 0, 840, "0", "0"],
      [2, "product", "084854", 125, 0, 125, "4", "6"],
    ]);
    expect(r.totals).toMatchObject({ grossCents: 6807, discountCents: 60, netCents: 6747, vatCents: 1316, totalCents: 8063, depositsCents: 840, productUnits: "9", depositUnits: "3" });
  });

  test("código como texto (zeros à esquerda), fator PR Unit/KG × Unit/KG e indicadores preservados", () => {
    const [a, b, c] = readInvoice(syntheticMakro(), layouts).lines;
    expect(a).toMatchObject({ supplierCode: "0001234567890", promoCode: "11111", description: "ARTIGO A TESTE 1KG" });
    expect(b).toMatchObject({ supplierCode: "042308", flags: ["P"] });
    expect(c).toMatchObject({ basePriceText: "22,585", factorText: "2", unitPriceText: "45,17", quantityText: "1" });
  });

  test("depósito «0 D» fica ligado ao artigo anterior; IEC é anotação, nunca somada", () => {
    const r = readInvoice(syntheticMakro(), layouts);
    const dep = r.lines.find((l) => l.kind === "deposit")!;
    expect(dep).toMatchObject({ flags: ["D"], relatedLineIndex: 2 });
    expect(r.lines[2]!.notes).toEqual(["95 TAXA IEC INCL. PREÇO U.V 0,304 * 1 = 0,30"]);
    expect(r.lines).toHaveLength(5);
  });

  test("IVA por taxa: linha a linha daria 0,16 €, o documento diz 0,15 € — aceite, sem mexer nas linhas", () => {
    const r = readInvoice(syntheticMakro(), layouts);
    expect(r.vatTable.find((v) => v.code === "4")).toMatchObject({ baseCents: 250, vatCents: 15 });
    expect(r.status).toBe("ready");
  });

  test("talão TPA e textos fora da tabela são ignorados", () => {
    const r = readInvoice(syntheticMakro(), layouts);
    expect(r.lines.some((l) => /TPA|COMPRA/.test(l.rawText))).toBe(false);
  });

  test("sem QR legível: lê pelo texto, avisa (não bloqueia) e fecha pelo «Valor Total»", () => {
    const r = readInvoice(syntheticMakro({ qr: null }), layouts);
    expect(codes(r)).toEqual(["qr_missing"]);
    expect(r.status).toBe("ready");
    expect(r.totals.totalCents).toBe(8063);
  });

  test("QR que contradiz o documento bloqueia (quadro de IVA e total)", () => {
    const qr = QR.replace("I7:56.57*I8:13.01*N:13.16*O:80.63", "I7:57.57*I8:13.24*N:13.39*O:81.86");
    const r = readInvoice(syntheticMakro({ qr }), layouts);
    expect(r.status).toBe("needs_attention");
    expect(codes(r)).toEqual(expect.arrayContaining(["qr_vat_table_mismatch", "qr_header_mismatch", "amounts_not_reconciled"]));
  });

  test("QR com número diferente do cabeçalho bloqueia", () => {
    const r = readInvoice(syntheticMakro({ qr: QR.replace("G:FAC 0001/000001", "G:FAC 0001/000002") }), layouts);
    expect(codes(r)).toContain("qr_header_mismatch");
  });

  test("quantidade × preço diferente do total impresso bloqueia (e o total não fecha)", () => {
    const r = readInvoice(syntheticMakro({ lineCTotal: "45,71" }), layouts);
    expect(r.status).toBe("needs_attention");
    expect(codes(r)).toEqual(expect.arrayContaining(["line_total_mismatch", "net_total_mismatch"]));
  });

  test("código de IVA sem taxa no quadro do documento bloqueia — nunca presume a taxa", () => {
    const r = readInvoice(syntheticMakro({ lineAVat: "7" }), layouts);
    expect(r.lines[0]!.vatRate).toBeNull();
    expect(codes(r)).toContain("vat_code_unknown");
  });

  test("desconto com MOT sem artigo correspondente bloqueia", () => {
    const page2 = defaultPage2().map((row) => (row.some((x) => x.text === "11111") ? w(500, 99, "Leve Mais Pague Menos").concat(w(500, 474, "0,60"), w(500, 496, "2"), w(500, 517, "99999")) : row));
    const r = readInvoice(syntheticMakro({ page2 }), layouts);
    expect(codes(r)).toContain("discount_reference_missing");
    expect(r.status).toBe("needs_attention");
  });

  test("desconto sem código de promoção: repartido pelas linhas do mesmo IVA e assinalado (não bloqueia)", () => {
    const page2 = defaultPage2().map((row) => (row.some((x) => x.text === "11111") ? w(500, 99, "Desconto especial").concat(w(500, 474, "0,60"), w(500, 496, "2")) : row));
    const r = readInvoice(syntheticMakro({ page2 }), layouts);
    expect(codes(r)).toEqual(["discount_without_reference"]);
    expect(r.lines.filter((l) => l.vatCode === "2").reduce((a, l) => a + l.discountCents, 0)).toBe(60);
    expect(r.status).toBe("ready");
  });

  test("linha com valores que o leitor não reconhece bloqueia (não é ignorada em silêncio)", () => {
    const page2 = [w(520, 120, "LINHA ESTRANHA 9,99 X Y"), ...defaultPage2()];
    const r = readInvoice(syntheticMakro({ page2 }), layouts);
    expect(codes(r)).toContain("unrecognized_row");
  });

  test("nº de artigos diferente da soma das quantidades bloqueia", () => {
    const page2 = defaultPage2().map((row) => row.map((x) => (x.text === "9" && x.x < 120 ? { ...x, text: "10" } : x)));
    const r = readInvoice(syntheticMakro({ page2 }), layouts);
    expect(codes(r)).toContain("item_count_mismatch");
  });

  test("layout desconhecido → unsupported (o chamador usa a IA), com o QR lido", () => {
    const content = syntheticMakro();
    content.pages = content.pages.map((p) => ({ ...p, words: p.words.filter((x) => !/MAKRO|PACK/.test(x.text)) }));
    const r = readInvoice({ ...content, qrCodes: [{ page: 1, text: QR.replace("A:502030712", "A:999999990") }] }, layouts);
    expect(r.status).toBe("unsupported");
    expect(r.qr?.totalCents).toBe(8063);
    expect(codes(r)).toEqual(["layout_unknown"]);
  });
});
