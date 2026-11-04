import { dec } from "../../../../kernel/money/decimal.js";
import { computeDocumentTotals, type DraftLine } from "../../domain/services/document-totals.service.js";
import { formatAmount } from "../../domain/services/amount-format.js";

const rate = (percentage: string, code: "RED" | "INT" | "NOR" = "NOR") =>
  ({ kind: "rate", region: "PT", code, percentage: dec(percentage) }) as const;

const line = (quantity: string, unitPrice: string, tax: DraftLine["tax"], discountPct?: string): DraftLine => ({
  description: "Artigo",
  quantity: dec(quantity),
  unitPrice: dec(unitPrice),
  tax,
  ...(discountPct ? { discountPct: dec(discountPct) } : {}),
});

const summary = (t: ReturnType<typeof computeDocumentTotals>) => ({
  net: formatAmount(t.netTotal),
  tax: formatAmount(t.taxPayable),
  gross: formatAmount(t.grossTotal),
  byRate: t.taxSummary.map((s) => `${s.code} ${formatAmount(s.percentage)}%: ${formatAmount(s.taxableBase)} + ${formatAmount(s.taxAmount)}`),
});

describe("totais e IVA do documento (CIVA art. 36.º n.º 5; Despacho 8632/2014 3.2.3, 3.2.6, 3.2.8)", () => {
  it("preços com IVA incluído (restauração): o cliente paga exatamente o preço do menu", () => {
    const totals = computeDocumentTotals({
      pricesIncludeTax: true,
      lines: [line("2", "12.50", rate("13", "INT")), line("1", "3.00", rate("23"))],
    });

    // 13 %: 25,00 × 13/113 = 2,876… → 2,88; base 22,12. 23 %: 3,00 × 23/123 = 0,560… → 0,56; base 2,44.
    expect(summary(totals)).toEqual({
      net: "24.56",
      tax: "3.44",
      gross: "28.00",
      byRate: ["INT 13.00%: 22.12 + 2.88", "NOR 23.00%: 2.44 + 0.56"],
    });
  });

  it("aplica desconto de linha antes do imposto", () => {
    const totals = computeDocumentTotals({ pricesIncludeTax: true, lines: [line("1", "12.50", rate("13", "INT"), "10")] });

    // 12,50 − 10 % = 11,25; IVA 11,25 × 13/113 = 1,294… → 1,29; base 9,96
    expect(summary(totals)).toMatchObject({ net: "9.96", tax: "1.29", gross: "11.25" });
  });

  it("preços sem IVA: calcula com mais de 2 casas e arredonda só nos totais", () => {
    const totals = computeDocumentTotals({ pricesIncludeTax: false, lines: [line("3", "1.333", rate("23"))] });

    // base 3,999 → 4,00; IVA 0,92; total 4,92 (linha a linha a 2 casas daria 3,99)
    expect(summary(totals)).toMatchObject({ net: "4.00", tax: "0.92", gross: "4.92" });
  });

  it("linha isenta exige código de motivo da tabela da AT e não tem imposto", () => {
    const exempt = { kind: "exempt", region: "PT", exemptionCode: "M07", exemptionReason: "Isento artigo 9.º do CIVA" } as const;
    const totals = computeDocumentTotals({ pricesIncludeTax: true, lines: [line("1", "10.00", exempt)] });

    expect(summary(totals)).toMatchObject({ net: "10.00", tax: "0.00", gross: "10.00" });
    expect(totals.exemptions).toEqual([{ region: "PT", code: "M07", reason: "Isento artigo 9.º do CIVA", taxableBase: dec("10.00") }]);
  });

  it("recusa isenção sem código válido (ex.: M03 não existe na tabela v4.0) ou sem menção", () => {
    const bad = (code: string, reason: string) =>
      computeDocumentTotals({
        pricesIncludeTax: true,
        lines: [line("1", "10.00", { kind: "exempt", region: "PT", exemptionCode: code, exemptionReason: reason })],
      });

    expect(() => bad("M03", "Qualquer")).toThrow();
    expect(() => bad("M07", " ")).toThrow();
  });

  it("recusa taxa 0 % sem ser isenção, desconto fora de 0–100 % e quantidades ou preços negativos", () => {
    const calc = (l: DraftLine) => () => computeDocumentTotals({ pricesIncludeTax: true, lines: [l] });

    expect(calc(line("1", "10.00", rate("0")))).toThrow();
    expect(calc(line("1", "10.00", rate("23"), "101"))).toThrow();
    expect(calc(line("-1", "10.00", rate("23")))).toThrow();
    expect(calc(line("1", "-10.00", rate("23")))).toThrow();
    expect(() => computeDocumentTotals({ pricesIncludeTax: true, lines: [] })).toThrow();
  });
});
