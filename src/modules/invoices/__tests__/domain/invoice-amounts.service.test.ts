import { computeHeaderOnlyDifference, computeInvoiceAmounts, describeIssues } from "../../domain/services/invoice-amounts.service.js";

const mozzarella = { id: "l1", quantity: 20, unitCostWithoutVat: 620, discount: { kind: "pct" as const, value: 10 }, vatRate: 6 };

describe("computeInvoiceAmounts (motor único na fatura)", () => {
  test("Mozzarella: 20×6,20 = 124,00; −10% = 12,40; base 111,60; IVA 6% = 6,70; total 118,30; diferença 0", () => {
    const r = computeInvoiceAmounts({ totalWithVat: 11830 }, [mozzarella]);
    expect(r.lines[0]).toMatchObject({ grossCents: 12400, lineDiscountCents: 1240, netCents: 11160 });
    expect(r.vatCents).toBe(670);
    expect(r.totalCents).toBe(11830);
    expect(r.finalDifferenceCents).toBe(0);
    expect(r.canFinalize).toBe(true);
    expect(r.lineVatCents.get("l1")).toBe(670);
  });

  test("desconto em € igual ao de % dá o mesmo resultado", () => {
    const r = computeInvoiceAmounts({ totalWithVat: 11830 }, [{ ...mozzarella, discount: { kind: "amount", value: 1240 } }]);
    expect(r.netCents).toBe(11160);
    expect(r.canFinalize).toBe(true);
  });

  test("diferença real bloqueia a finalização e é descrita", () => {
    const r = computeInvoiceAmounts({ totalWithVat: 11900 }, [mozzarella]);
    expect(r.finalDifferenceCents).toBe(70);
    expect(r.canFinalize).toBe(false);
    expect(describeIssues(r.blocking)).toContain("0,70 €");
  });

  test("ajuste de arredondamento: só até 1 cêntimo por taxa e com motivo", () => {
    const sem = computeInvoiceAmounts({ totalWithVat: 11831 }, [mozzarella]);
    expect(sem.canFinalize).toBe(false);
    const comMotivo = computeInvoiceAmounts({ totalWithVat: 11831, roundingAdjustment: { cents: 1, reason: "Arredondamento do fornecedor" } }, [mozzarella]);
    expect(comMotivo.roundingAdjustmentCents).toBe(1);
    expect(comMotivo.canFinalize).toBe(true);
    const semMotivo = computeInvoiceAmounts({ totalWithVat: 11831, roundingAdjustment: { cents: 1, reason: "x" } }, [mozzarella]);
    expect(semMotivo.canFinalize).toBe(false);
    const grande = computeInvoiceAmounts({ totalWithVat: 11835, roundingAdjustment: { cents: 5, reason: "Arredondamento do fornecedor" } }, [mozzarella]);
    expect(grande.roundingAdjustmentCents).toBe(0);
    expect(grande.canFinalize).toBe(false);
  });

  test("taxa de IVA em falta nunca é tratada como 0%", () => {
    const r = computeInvoiceAmounts({ totalWithVat: 11160 }, [{ ...mozzarella, vatRate: null }]);
    expect(r.canFinalize).toBe(false);
    expect(r.blocking.map((i) => i.code)).toContain("vat_rate_missing");
  });

  test("preço com mais casas decimais (texto original) e quantidade ambígua resolvida pelo bruto impresso", () => {
    const r = computeInvoiceAmounts({ totalWithVat: 2624 }, [
      { id: "a", quantity: 20000, quantityText: "20.000", grossCentsPrinted: 2470, unitCostWithoutVat: 124, unitPriceText: "1,235", vatRate: 6 },
    ]);
    expect(r.lines[0]!.grossCents).toBe(2470);
    expect(r.vatCents).toBe(148);
    expect(r.finalDifferenceCents).toBe(6);
  });

  test("várias taxas: IVA por taxa e IVA por linha somam exatamente", () => {
    const r = computeInvoiceAmounts({ totalWithVat: 1000 + 230 + 500 + 30 }, [
      { id: "a", quantity: 1, unitCostWithoutVat: 1000, vatRate: 23 },
      { id: "b", quantity: 1, unitCostWithoutVat: 500, vatRate: 6 },
    ]);
    expect(r.vatByRate.map((v) => v.vatCents).sort()).toEqual([230, 30].sort());
    expect([...r.lineVatCents.values()].reduce((a, b) => a + b, 0)).toBe(260);
    expect(r.canFinalize).toBe(true);
  });
});

describe("computeHeaderOnlyDifference (modo simples)", () => {
  test("base + IVA + ajustes = total", () => {
    expect(computeHeaderOnlyDifference({ subtotalWithoutVat: 11160, totalVat: 670, totalWithVat: 11830 }).canFinalize).toBe(true);
    const r = computeHeaderOnlyDifference({ subtotalWithoutVat: 11160, totalVat: 670, totalWithVat: 11900 });
    expect(r.differenceCents).toBe(70);
    expect(r.canFinalize).toBe(false);
  });
});
