import { computedPayoutCents, sumLines, type PlatformStatement } from "../../domain/entities/platform-statement.js";
import { isGlovoStatement, parseGlovoStatement } from "../../domain/services/glovo-statement.parser.js";
import { isUberMonthlyStatement, parseUberMonthlyStatement } from "../../domain/services/uber-statement.parser.js";
import { amountAfterLabel, parseAmountCents, parseEnglishDate } from "../../domain/services/text-amounts.js";
import { GLOVO_STATEMENT_TEXT, UBER_MONTHLY_TEXT } from "../fixtures/statement-texts.js";

function ok(r: PlatformStatement | { error: string }): PlatformStatement {
  if ("error" in r) throw new Error(r.error);
  return r;
}

describe("text-amounts", () => {
  it("lê valores portugueses e com ponto decimal", () => {
    expect(parseAmountCents("4 074,30 €")).toBe(407_430);
    expect(parseAmountCents("4 074,30 €")).toBe(407_430);
    expect(parseAmountCents("1.633,60 €")).toBe(163_360);
    expect(parseAmountCents("-1 403,87 €")).toBe(-140_387);
    expect(parseAmountCents("19.28")).toBe(1_928);
    expect(parseAmountCents("-15.11")).toBe(-1_511);
    expect(parseAmountCents("abc")).toBeNull();
  });

  it("valor na linha de um rótulo; datas em inglês", () => {
    expect(amountAfterLabel("Vendas (149 Pedidos) \t4 074,30 €\nOutra 1,00 €", /Vendas \(\d+ Pedidos\)/)).toBe(407_430);
    expect(amountAfterLabel("Total líquido \t1 848,79 €*", /Total l[íi]quido/)).toBe(184_879);
    expect(amountAfterLabel("Nada aqui", "Taxas")).toBeNull();
    expect(parseEnglishDate("Sep 07, 2026")).toBe("2026-09-07");
  });
});

describe("parseUberMonthlyStatement", () => {
  it("reconhece o extrato e lê o resumo do mês, as semanas pagas e o total", () => {
    expect(isUberMonthlyStatement(UBER_MONTHLY_TEXT)).toBe(true);
    expect(isUberMonthlyStatement(GLOVO_STATEMENT_TEXT)).toBe(false);
    const s = ok(parseUberMonthlyStatement(UBER_MONTHLY_TEXT));
    expect(s).toMatchObject({
      platform: "uber_eats",
      documentNumber: "ABC123XY",
      periodFrom: "2026-03-01",
      periodTo: "2026-03-31",
      ordersCount: 10,
      netPayoutCents: 79_946,
    });
    expect(sumLines(s, "sales")).toBe(130_000);
    expect(sumLines(s, "promotion")).toBe(3_000);
    expect(sumLines(s, "commission")).toBe(43_974);
    expect(sumLines(s, "commission", "vatCents")).toBe(43_974 - Math.round(43_974 / 1.23));
    expect(sumLines(s, "marketing")).toBe(2_460 + 123);
    expect(sumLines(s, "refund")).toBe(500 - 1);
    expect(sumLines(s, "other_fee")).toBe(-2);
    // As linhas somam o total líquido do documento.
    expect(computedPayoutCents(s)).toBe(s.netPayoutCents);
    expect(s.payouts).toEqual([
      { periodFrom: "2026-02-23", periodTo: "2026-03-01", paidOn: "2026-03-02", netCents: 2_524 },
      { periodFrom: "2026-03-02", periodTo: "2026-03-08", paidOn: "2026-03-09", netCents: 3_786 },
    ]);
  });

  it("sem número do extrato ou sem vendas → erro", () => {
    expect(parseUberMonthlyStatement(UBER_MONTHLY_TEXT.replace("#ABC123XY", ""))).toEqual({ error: "sem número do extrato" });
    expect(parseUberMonthlyStatement(UBER_MONTHLY_TEXT.replace("Vendas (10 Pedidos)", "Outra coisa"))).toEqual({ error: "sem vendas no resumo do mês" });
  });
});

describe("parseGlovoStatement", () => {
  it("lê a fatura (taxas + IVA repartido), a liquidação, os pedidos e o valor a transferir", () => {
    expect(isGlovoStatement(GLOVO_STATEMENT_TEXT)).toBe(true);
    expect(isGlovoStatement(UBER_MONTHLY_TEXT)).toBe(false);
    const s = ok(parseGlovoStatement(GLOVO_STATEMENT_TEXT));
    expect(s).toMatchObject({
      platform: "glovo",
      documentNumber: "I26TESTE0000001",
      periodFrom: "2026-03-01",
      periodTo: "2026-03-15",
      issuedOn: "2026-03-17",
      ordersCount: 2,
      netPayoutCents: 112_997,
    });
    expect(sumLines(s, "sales")).toBe(130_000);
    expect(sumLines(s, "promotion")).toBe(3_000);
    // Comissão = acesso à plataforma + Prime (o detalhe «serviço da plataforma/estafetas» não se soma).
    expect(s.lines.filter((l) => l.kind === "commission").map((l) => l.label)).toEqual(["Taxa de acesso à plataforma Glovo", "Taxa por pedido com Glovo Prime"]);
    // O IVA da fatura reparte-se pelas taxas e soma exatamente o do documento.
    const fees = s.lines.filter((l) => ["commission", "marketing", "other_fee"].includes(l.kind));
    expect(fees.reduce((a, l) => a + l.vatCents, 0)).toBe(2_291);
    expect(fees.reduce((a, l) => a + l.grossCents, 0)).toBe(12_253);
    expect(sumLines(s, "refund")).toBe(250);
    expect(sumLines(s, "cash")).toBe(1_500);
    expect(computedPayoutCents(s)).toBe(s.netPayoutCents);
    expect(s.payouts).toEqual([{ periodFrom: "2026-03-01", periodTo: "2026-03-15", paidOn: null, netCents: 112_997 }]);
  });

  it("taxas que não somam o subtotal → erro (não se grava uma leitura errada)", () => {
    expect(parseGlovoStatement(GLOVO_STATEMENT_TEXT.replace("Subtotal 99,62 €", "Subtotal 98,62 €"))).toEqual({ error: "as taxas não somam o subtotal da fatura" });
  });

  it("nunca guarda descrições dos pedidos (notas, alergias)", () => {
    const s = ok(parseGlovoStatement(GLOVO_STATEMENT_TEXT));
    expect(JSON.stringify(s)).not.toMatch(/ALERGIAS|Pizza Teste/);
  });
});
