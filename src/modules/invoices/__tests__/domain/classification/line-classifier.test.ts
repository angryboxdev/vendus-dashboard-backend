import { classifyLinesDeterministic, type CatalogEntry, type LineToClassify } from "../../../domain/services/classification/line-classifier.js";
import { normalizeDescription } from "../../../domain/services/classification/keyword-rules.js";

const cat = (id: string, code: string, name: string, isActive = true): CatalogEntry => ({ id, code, name, groupName: code.split(".")[0]!, isActive });
const catalog = [
  cat("c-ing", "OPD.01", "Ingredientes"),
  cat("c-beb", "OPD.02", "Bebidas"),
  cat("c-emb", "OPD.03", "Embalagens e descartáveis"),
  cat("c-lim", "OPD.08", "Limpeza & Higiene"),
  cat("c-con", "OPD.09", "Consumíveis operacionais"),
  cat("c-ute", "EST.07", "Utensílios e pequeno equipamento"),
  cat("c-dep", "FDR.05", "Adiantamentos, depósitos e cauções"),
  cat("c-old", "XXX.01", "Inativa", false),
];
const line = (index: number, description: string, extra: Partial<LineToClassify> = {}): LineToClassify => ({ index, kind: "product", supplierCode: null, description, ...extra });
const run = (lines: LineToClassify[], history: { supplierCode: string | null; description: string; categoryId: string }[] = []) =>
  classifyLinesDeterministic({ lines, catalog, history });

describe("classificação por linha (determinística)", () => {
  test("cada linha é classificada pela natureza, não pelo habitual do fornecedor", () => {
    const r = run([
      line(0, "ARTIGO SACOS LIXO 10X100LT"),
      line(1, "QJ CREME BALDE 5KG"),
      line(2, "COCA COLA ZERO LATA 28X33CL"),
      line(3, "MPRO TERMOMETRO INFRAVERMELHO"),
      line(4, "PILHA ALCALINA AA"),
      line(5, "AG.ALCALINA 6X51 CL"),
      line(6, "COPOS PLA 100X200ML"),
      line(7, "MPRO COLHER MOLHO PIZZA 90GR"),
    ]);
    expect(r.map((c) => c.categoryId)).toEqual(["c-lim", "c-ing", "c-beb", "c-ute", "c-con", "c-beb", "c-emb", "c-ute"]);
    expect(r.every((c) => c.source === "keyword")).toBe(true);
    expect(r[0]!.evidence).toContain("LIXO");
  });

  test("depósito vai para cauções pelo tipo da linha (não por palavra)", () => {
    const [c] = run([line(0, "QUALQUER TEXTO", { kind: "deposit" })]);
    expect(c).toMatchObject({ categoryId: "c-dep", source: "line_kind" });
  });

  test("histórico confirmado do fornecedor: referência primeiro, depois descrição; ganha às palavras-chave", () => {
    const r = run(
      [line(0, "PRODUTO X 1KG", { supplierCode: "0012345" }), line(1, "Água das Pedras 25cl"), line(2, "TOMATE PELADO 2,5KG")],
      [
        { supplierCode: "0012345", description: "outro texto", categoryId: "c-emb" },
        { supplierCode: null, description: "AGUA DAS PEDRAS 25CL", categoryId: "c-ing" },
      ],
    );
    expect(r.map((c) => [c.categoryId, c.source])).toEqual([["c-emb", "history_code"], ["c-ing", "history_description"], ["c-ing", "keyword"]]);
  });

  test("histórico em conflito suspende a aplicação automática (nem palavras-chave)", () => {
    const [c] = run([line(0, "COCA COLA 33CL", { supplierCode: "777" })], [
      { supplierCode: "777", description: "a", categoryId: "c-beb" },
      { supplierCode: "777", description: "b", categoryId: "c-ing" },
    ]);
    expect(c).toMatchObject({ categoryId: null, source: "none", conflict: true });
  });

  test("nunca devolve subcategorias inativas nem ausentes do catálogo da organização", () => {
    const [a, b] = classifyLinesDeterministic({
      lines: [line(0, "PRODUTO Y", { supplierCode: "1" }), line(1, "COCA COLA")],
      catalog: catalog.filter((c) => c.code !== "OPD.02"),
      history: [{ supplierCode: "1", description: "PRODUTO Y", categoryId: "c-old" }],
    });
    expect(a!.categoryId).toBeNull();
    expect(b!.categoryId).toBeNull();
  });

  test("sem regra nem histórico → por resolver (vai à IA ou à revisão)", () => {
    const [c] = run([line(0, "MPRO ARM REFRIG GSC2360 PRETO")]);
    expect(c).toMatchObject({ categoryId: null, source: "none" });
    expect(c!.conflict).toBeUndefined();
  });

  test("normalização: acentos, pontuação e maiúsculas", () => {
    expect(normalizeDescription("Açúcar pó  #Icing.3kg")).toBe("ACUCAR PO ICING 3KG");
  });
});
