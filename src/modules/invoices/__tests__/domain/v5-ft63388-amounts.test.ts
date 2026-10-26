import { computeInvoiceAmounts } from "../../domain/services/invoice-amounts.service.js";

// Task V5 §4.2 — FT 63388 (Dream Plus, 05/10/2026): 5 linhas, 4 artigos, descontos por linha.
// Valores do documento (sem dados pessoais); a quantidade «40,000» é 40.
const lines = [
  { id: "mozz", quantity: 40, quantityText: "40,000", unitCostWithoutVat: 620, unitPriceText: "6,20", discount: { kind: "pct" as const, value: 10 }, vatRate: 6 },
  { id: "grana", quantity: 1, quantityText: "1,000", unitCostWithoutVat: 1559, unitPriceText: "15,59", discount: { kind: "pct" as const, value: 5 }, vatRate: 6 },
  { id: "cheddar-a", quantity: 6, quantityText: "6,000", unitCostWithoutVat: 820, unitPriceText: "8,20", discount: { kind: "pct" as const, value: 5 }, vatRate: 6 },
  { id: "cheddar-b", quantity: 1, quantityText: "1,000", unitCostWithoutVat: 820, unitPriceText: "8,20", discount: { kind: "pct" as const, value: 5 }, vatRate: 6 },
  { id: "tomate", quantity: 4, quantityText: "4,000", unitCostWithoutVat: 1068, unitPriceText: "10,68", discount: { kind: "pct" as const, value: 10 }, vatRate: 23 },
];
const vatSummary = [
  { rate: "6", baseCents: 29254, vatCents: 1755 },
  { rate: "23", baseCents: 3845, vatCents: 884 },
];

describe("V5 — FT 63388: descontos por linha, resumo do cabeçalho e IVA misto", () => {
  test("T01/T07/T10: bruto 363,71; descontos 32,72 por linha; base 330,99; IVA 17,55 + 8,84 = 26,39; total 357,38", () => {
    const r = computeInvoiceAmounts({ totalWithVat: 35738, vatSummary }, lines);
    expect(r.lines.map((l) => [l.id, l.grossCents, l.lineDiscountCents, l.netCents])).toEqual([
      ["mozz", 24800, 2480, 22320],
      ["grana", 1559, 78, 1481],
      ["cheddar-a", 4920, 246, 4674],
      ["cheddar-b", 820, 41, 779],
      ["tomate", 4272, 427, 3845],
    ]);
    expect([r.grossCents, r.discountCents, r.netCents, r.vatCents, r.totalCents]).toEqual([36371, 3272, 33099, 2639, 35738]);
    expect(r.vatByRate.map((v) => [String(v.rate), v.baseCents, v.vatCents])).toEqual([["6", 29254, 1755], ["23", 3845, 884]]);
    expect(r.finalDifferenceCents).toBe(0);
    expect(r.canFinalize).toBe(true);
  });

  test("T08: «Desconto Comercial 32,72» no rodapé = soma das linhas → só resumo, nunca deduzido outra vez", () => {
    const r = computeInvoiceAmounts({ totalWithVat: 35738, footerDiscountCents: 3272, vatSummary }, lines);
    expect(r.netCents).toBe(33099);
    expect(r.lines.every((l) => l.globalDiscountCents === 0)).toBe(true);
    expect(r.canFinalize).toBe(true);
  });

  test("T09 (fixture): desconto genuíno só no cabeçalho → repartido pelas linhas, cêntimos reconciliados", () => {
    // 3 linhas sem desconto próprio (100 + 200 + 300 = 600 €), desconto adicional de 10,00 € no rodapé.
    const fixture = [
      { id: "a", quantity: 1, unitCostWithoutVat: 10000, vatRate: 6 },
      { id: "b", quantity: 1, unitCostWithoutVat: 20000, vatRate: 6 },
      { id: "c", quantity: 1, unitCostWithoutVat: 30000, vatRate: 6 },
    ];
    const net = 60000 - 1000;
    const r = computeInvoiceAmounts({ totalWithVat: net + Math.round(net * 0.06), footerDiscountCents: 1000 }, fixture);
    expect(r.lines.map((l) => l.globalDiscountCents)).toEqual([167, 333, 500]);
    expect(r.lines.reduce((s, l) => s + l.globalDiscountCents, 0)).toBe(1000);
    expect(r.netCents).toBe(net);
  });
});
