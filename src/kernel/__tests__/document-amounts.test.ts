import { dec, parseDecimal, pctOfCents, resolveQuantity, toCents } from "../money/decimal.js";
import { computeDocumentAmounts, distribute, type AmountLine } from "../money/document-amounts.js";

const line = (over: Partial<AmountLine> & { id: string }): AmountLine => ({ quantity: dec("1"), unitPrice: dec("0"), discount: null, vatRate: dec("23"), ...over });

describe("Decimais exatos", () => {
  test("separadores segundo o documento; milhares só em grupos de 3; nada de float", () => {
    expect(parseDecimal("6,20", ",")).toEqual({ units: 620n, scale: 2 });
    expect(parseDecimal("1.234,56", ",")).toEqual({ units: 123456n, scale: 2 });
    expect(parseDecimal("1,234.56", ".")).toEqual({ units: 123456n, scale: 2 });
    expect(parseDecimal("12.34,5", ",")).toBeNull();
    expect(parseDecimal("abc", ",")).toBeNull();
    expect(toCents(dec("0.105"))).toBe(11); // metade para longe do zero
    expect(toCents(dec("-0.105"))).toBe(-11);
    expect(pctOfCents(11160, dec("6"))).toBe(670); // 669,6 → 670
    expect(0.1 + 0.2).not.toBe(0.3); // o problema que o motor evita
    expect(toCents(dec("0.1")) + toCents(dec("0.2"))).toBe(30);
  });

  test("quantidade '20.000' conforme o formato original: a leitura que reconcilia com a linha", () => {
    expect(resolveQuantity("20.000", dec("6.20"), 12400)).toEqual({ units: 20000n, scale: 3 }); // 20,000 (3 decimais)
    expect(resolveQuantity("20.000", dec("0.0062"), 12400)).toEqual({ units: 20000n, scale: 0 }); // vinte mil
    expect(resolveQuantity("20.000", dec("1"), 999)).toBeNull(); // nenhuma leitura coerente → por validar
  });
});

describe("Motor de valores do documento", () => {
  test("Mozzarella: 20 × 6,20 = 124,00; −10% = 12,40; base 111,60; IVA 6% = 6,70; total 118,30; diferença 0,00; rodapé não duplicado", () => {
    const r = computeDocumentAmounts({
      lines: [line({ id: "mozz", quantity: dec("20.000"), unitPrice: dec("6.20"), discount: { kind: "pct", value: dec("10") }, vatRate: dec("6") })],
      footerDiscountCents: 1240,
      declared: { totalCents: 11830, vatByRate: [{ rate: dec("6"), baseCents: 11160, vatCents: 670 }] },
    });
    expect(r.lines[0]).toEqual({ id: "mozz", grossCents: 12400, lineDiscountCents: 1240, globalDiscountCents: 0, netCents: 11160, vatRate: "6" });
    expect([r.grossCents, r.discountCents, r.netCents, r.vatCents, r.totalCents, r.differenceCents]).toEqual([12400, 1240, 11160, 670, 11830, 0]);
    expect(r.footer).toBe("summary_of_lines");
    expect(r.reconciled).toBe(true);
  });

  test("desconto em % ou € é a mesma operação (não dois descontos)", () => {
    const pct = computeDocumentAmounts({ lines: [line({ id: "a", quantity: dec("20"), unitPrice: dec("6.20"), discount: { kind: "pct", value: dec("10") }, vatRate: dec("6") })], declared: { totalCents: 11830 } });
    const eur = computeDocumentAmounts({ lines: [line({ id: "a", quantity: dec("20"), unitPrice: dec("6.20"), discount: { kind: "amount", cents: 1240 }, vatRate: dec("6") })], declared: { totalCents: 11830 } });
    expect(eur.netCents).toBe(pct.netCents);
    expect(eur.totalCents).toBe(pct.totalCents);
  });

  test("múltiplas taxas: IVA calculado por taxa (quadro-resumo), nunca taxa média", () => {
    const r = computeDocumentAmounts({
      lines: [
        line({ id: "agua", quantity: dec("10"), unitPrice: dec("0.55"), vatRate: dec("6") }),
        line({ id: "vinho", quantity: dec("3"), unitPrice: dec("4.99"), vatRate: dec("23") }),
        line({ id: "gelo", quantity: dec("2"), unitPrice: dec("1.25"), vatRate: dec("13") }),
      ],
      declared: { totalCents: null },
    });
    expect(r.vatByRate).toEqual([
      { rate: "6", baseCents: 550, vatCents: 33 },
      { rate: "13", baseCents: 250, vatCents: 33 },
      { rate: "23", baseCents: 1497, vatCents: 344 },
    ]);
    expect(r.totalCents).toBe(550 + 250 + 1497 + 33 + 33 + 344);
    expect(r.issues).toEqual([{ code: "total_missing" }]);
  });

  test("desconto global adicional repartido pelas linhas abrangidas, por taxa, com cêntimos reconciliados", () => {
    const r = computeDocumentAmounts({
      lines: [
        line({ id: "a", quantity: dec("1"), unitPrice: dec("10.00"), discount: { kind: "pct", value: dec("10") }, vatRate: dec("6") }),
        line({ id: "b", quantity: dec("1"), unitPrice: dec("10.00"), vatRate: dec("23") }),
        line({ id: "c", quantity: dec("1"), unitPrice: dec("10.00"), vatRate: dec("23"), inGlobalDiscount: false }),
      ],
      globalDiscount: { kind: "amount", cents: 100 },
      declared: { totalCents: null },
    });
    // bases abrangidas 900 + 1000 → 100 cêntimos repartidos 47 + 53 (soma exata)
    expect(r.lines.map((l) => l.globalDiscountCents)).toEqual([47, 53, 0]);
    expect(r.discountCents).toBe(100 + 100);
    expect(r.footer).toBe("global");
  });

  test("rodapé: resumo das linhas não reaplica; sem descontos de linha passa a global; caso misto fica ambíguo (não aplica)", () => {
    const base = [line({ id: "a", quantity: dec("1"), unitPrice: dec("100"), vatRate: dec("23") })];
    expect(computeDocumentAmounts({ lines: base, footerDiscountCents: 500, declared: { totalCents: null } }).netCents).toBe(9500);
    const withLine = [line({ id: "a", quantity: dec("1"), unitPrice: dec("100"), discount: { kind: "amount", cents: 300 }, vatRate: dec("23") })];
    const amb = computeDocumentAmounts({ lines: withLine, footerDiscountCents: 500, declared: { totalCents: null } });
    expect(amb.footer).toBe("ambiguous");
    expect(amb.netCents).toBe(9700);
    expect(amb.issues).toContainEqual({ code: "footer_discount_ambiguous", footerCents: 500, linesCents: 300 });
  });

  test("taxa de IVA em falta é por validar (não 0%): bloqueia reconciliação", () => {
    const r = computeDocumentAmounts({ lines: [line({ id: "x", quantity: dec("1"), unitPrice: dec("10"), vatRate: null })], declared: { totalCents: 1000 } });
    expect(r.issues).toContainEqual({ code: "vat_rate_missing", lineId: "x" });
    expect(r.vatCents).toBe(0);
    expect(r.reconciled).toBe(false);
  });

  test("diferença para a fatura ao cêntimo; IVA declarado diferente é sinalizado", () => {
    const r = computeDocumentAmounts({
      lines: [line({ id: "a", quantity: dec("3"), unitPrice: dec("0.333"), vatRate: dec("23") })],
      declared: { totalCents: 124, vatByRate: [{ rate: dec("23"), baseCents: 100, vatCents: 24 }] },
    });
    expect(r.netCents).toBe(100); // 0,999 → 1,00
    expect(r.vatCents).toBe(23);
    expect(r.differenceCents).toBe(1);
    expect(r.issues.map((i) => i.code)).toEqual(["vat_mismatch", "difference"]);
    expect(r.reconciled).toBe(false);
  });

  test("ajustes documentados somam ao total; repartição determinística com soma exata", () => {
    const r = computeDocumentAmounts({ lines: [line({ id: "a", quantity: dec("1"), unitPrice: dec("10"), vatRate: dec("23") })], adjustments: [{ label: "Portes", cents: 350 }], declared: { totalCents: 1580 } });
    expect(r.totalCents).toBe(1580);
    expect(r.reconciled).toBe(true);
    expect(distribute(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(distribute(1, [5, 5])).toEqual([1, 0]);
    expect(distribute(9_999_999_999, [3_333_333_333, 6_666_666_666]).reduce((a, b) => a + b, 0)).toBe(9_999_999_999);
  });
});
