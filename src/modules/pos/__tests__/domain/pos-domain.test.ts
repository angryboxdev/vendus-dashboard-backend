import type { PosProduct } from "../../domain/entities/pos.js";
import { PosRuleError } from "../../domain/errors.js";
import { centsToEuros, discountPctFor, priceSale } from "../../domain/services/sale-pricing.service.js";
import { parseCsv, previewVendusCsv, priceToCents } from "../../domain/services/vendus-csv.service.js";

// Exportação fictícia no formato do Vendus (cabeçalho real, artigos inventados).
const HEADER =
  'Nome,Categoria,Marca,Referência,"Código de Barras",Descrição,"Descrição na Fatura",PVP,"Preço Fornecedor",Unidade,"Controlar Stock","IVA - Taxa","IVA - Isenção (Código)","IVA - Isenção (Norma)","Tipo de Produto","Classe de Bem","PVP - Delivery","PVP - Eatz","Loja",Imagem';
const row = (name: string, cat: string, ref: string, price: string, vat: string, stock = "Não", type = "P", img = "") =>
  `"${name}",${cat},,${ref},,"Descrição, com vírgula",Não,"${price}","0,0000",Uni,${stock},${vat},,,${type},,"1,0000",,S,${img}`;
const CSV = [
  HEADER,
  row("Pizza Teste (Grande)", "Grandes", "VPIZ1-1", "18,5000", "13", "Não", "P", "https://exemplo.invalid/p.png"),
  row("Refrigerante Teste 33cl", "Bebidas", "VREF2-1", "2,5000", "23", "Sim"),
  row("Refrigerante Teste 33cl", "", "VREF3-2", "2,5000", "13", "Sim"),
  row("Cupão TESTE", "", "VCUP4-1", "0,0000", "13"),
  row("Menu Teste", "Menus", "VMEN5-1", "15,9000", "13", "Não", "C"),
  row("Artigo IVA estranho", "Outros", "VOUT6-1", "3,0000", "18"),
].join("\r\n");

describe("CSV do Vendus", () => {
  it("lê campos entre aspas com vírgulas e quebras de linha", () => {
    expect(parseCsv('a,"b, c","d\n e"\r\n1,2,3')).toEqual([["a", "b, c", "d\n e"], ["1", "2", "3"]]);
  });

  it("preço com vírgula decimal → cêntimos (4 casas do Vendus)", () => {
    expect([priceToCents("9,9000"), priceToCents("0,3567"), priceToCents("18,50"), priceToCents("x")]).toEqual([990, 36, 1850, null]);
  });

  it("importa com preço, IVA, stock e foto; ignora 0 €, duplicados e IVA não suportado", () => {
    const p = previewVendusCsv(CSV);
    expect(p.toImport).toBe(3);
    const byRef = Object.fromEntries(p.rows.map((r) => [r.ref, r]));
    expect(byRef["VPIZ1-1"]!.product).toEqual({
      ref: "VPIZ1-1",
      name: "Pizza Teste (Grande)",
      category: "Grandes",
      priceCents: 1850,
      vatRate: 13,
      productType: "P",
      trackStock: false,
      imageUrl: "https://exemplo.invalid/p.png",
    });
    expect(byRef["VREF2-1"]!.product).toMatchObject({ trackStock: true, vatRate: 23 });
    expect(byRef["VREF2-1"]!.warnings).toEqual(["IVA diferente na linha 4 (13 %) — confirmar"]);
    expect(byRef["VREF3-2"]).toMatchObject({ status: "skip", reason: "Duplicado de VREF2-1 (linha 3)" });
    expect(byRef["VCUP4-1"]).toMatchObject({ status: "skip", reason: "Preço 0 € (modificador, cupão ou oferta)" });
    expect(byRef["VMEN5-1"]!.warnings).toContain("Tipo «C» do Vendus tratado como produto");
    expect(byRef["VOUT6-1"]).toMatchObject({ status: "skip", reason: "IVA 18 não suportado (6, 13 ou 23 %)" });
  });

  it("ficheiro sem as colunas obrigatórias → erro claro", () => {
    expect(() => previewVendusCsv("Nome,Preço\nA,1")).toThrow(/Colunas em falta/);
  });
});

const product = (over: Partial<PosProduct> = {}): PosProduct => ({
  id: "p1",
  ref: "VPIZ1-1",
  name: "Pizza Teste",
  category: "Grandes",
  priceCents: 1850,
  vatRate: 13,
  productType: "P",
  trackStock: false,
  imageUrl: null,
  active: true,
  ...over,
});

describe("Preços da venda", () => {
  it("sem descontos: total = preço × quantidade", () => {
    const s = priceSale([{ product: product(), quantity: 2 }, { product: product({ id: "p2", priceCents: 250 }), quantity: 1 }]);
    expect(s.totalCents).toBe(3950);
    expect(s.lines.map((l) => l.discountPct)).toEqual([null, null]);
  });

  it("desconto por linha em % e em €", () => {
    const s = priceSale([
      { product: product(), quantity: 2, discount: { kind: "pct", value: 10 } },
      { product: product({ id: "p2", priceCents: 250 }), quantity: 1, discount: { kind: "eur", value: 0.5 } },
    ]);
    expect(s.lines.map((l) => [l.totalCents, l.discountPct])).toEqual([
      [3330, "10"],
      [200, "20"],
    ]);
    expect(s.totalCents).toBe(3530);
  });

  it("desconto na venda repartido pelas linhas ao cêntimo", () => {
    const s = priceSale([{ product: product(), quantity: 1 }, { product: product({ id: "p2", priceCents: 250 }), quantity: 1 }], { kind: "eur", value: 1 });
    expect(s.totalCents).toBe(2000);
    expect(s.lines.reduce((t, l) => t + l.totalCents, 0)).toBe(2000);
  });

  it("a percentagem enviada ao documento reproduz o total da linha ao cêntimo", () => {
    for (const [gross, total] of [
      [1850, 1777],
      [990, 1],
      [12345, 6789],
      [250, 249],
    ] as const) {
      const pct = Number(discountPctFor(gross, total));
      expect(Math.round(gross * (100 - pct)) / 100).toBe(total);
    }
  });

  it("recusa quantidades e descontos inválidos", () => {
    expect(() => priceSale([{ product: product(), quantity: 0 }])).toThrow(PosRuleError);
    expect(() => priceSale([{ product: product(), quantity: 1, discount: { kind: "pct", value: 120 } }])).toThrow(/acima de 100/);
    expect(() => priceSale([{ product: product(), quantity: 1, discount: { kind: "eur", value: 20 } }])).toThrow(/maior do que o valor/);
    expect(() => priceSale([])).toThrow(/não tem artigos/);
  });

  it("cêntimos → euros com 2 casas", () => {
    expect([centsToEuros(990), centsToEuros(5), centsToEuros(1850)]).toEqual(["9.90", "0.05", "18.50"]);
  });
});
