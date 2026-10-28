import { computedPayoutCents, sumLines, type PlatformStatement } from "../../domain/entities/platform-statement.js";
import { isBoltWeeklyInvoice, parseBoltWeeklyInvoice } from "../../domain/services/bolt-invoice.parser.js";
import { isBoltOrdersReport, parseBoltOrdersReport } from "../../domain/services/bolt-orders.parser.js";
import { parseCsv } from "../../domain/services/csv.js";
import { readPlatformDocument } from "../../domain/services/platform-document-reader.js";
import { isSaftSales, parseSaftSales } from "../../domain/services/saft-sales.parser.js";
import { BOLT_INVOICE_TEXT, BOLT_ORDERS_CSV, saftText } from "../fixtures/bolt-saft-texts.js";
import { GLOVO_STATEMENT_TEXT, UBER_MONTHLY_TEXT } from "../fixtures/statement-texts.js";

function ok(r: PlatformStatement | { error: string }): PlatformStatement {
  if ("error" in r) throw new Error(r.error);
  return r;
}

describe("parseCsv", () => {
  it("aspas, vírgulas e aspas duplas dentro de células; CRLF", () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\r\n\r\n')).toEqual([
      ["a", "b, c", 'd "e"'],
      ["1", "2", "3"],
    ]);
  });
});

describe("parseBoltWeeklyInvoice", () => {
  it("lê o período, as linhas (título em duas linhas) e o total; abate à transferência", () => {
    expect(isBoltWeeklyInvoice(BOLT_INVOICE_TEXT)).toBe(true);
    expect(isBoltWeeklyInvoice(UBER_MONTHLY_TEXT)).toBe(false);
    const s = ok(parseBoltWeeklyInvoice(BOLT_INVOICE_TEXT));
    expect(s).toMatchObject({
      platform: "bolt_food",
      documentKind: "bolt_weekly_invoice",
      documentNumber: "PT9999-000123",
      periodFrom: "2026-02-23",
      periodTo: "2026-03-01",
      issuedOn: "2026-03-08",
      netPayoutCents: -4000,
    });
    expect(s.lines.map((l) => [l.kind, l.label, l.grossCents])).toEqual([
      ["commission", "Comissão semanal", 3000],
      ["marketing", "Custos com campanhas cofinanciadas", 100],
      ["marketing", "Investimento na campanha", -1000],
      ["marketing", "Taxa da campanha", 500],
      ["refund", "Deduções dos reembolsos", 1400],
    ]);
    expect(computedPayoutCents(s)).toBe(s.netPayoutCents);
  });

  it("linhas que não somam o total: erro", () => {
    expect(parseBoltWeeklyInvoice(BOLT_INVOICE_TEXT.replace("Taxa da campanha \t5.00 \t0 \t0 \t5.00", "Taxa da campanha \t6.00 \t0 \t0 \t6.00"))).toEqual({
      error: expect.stringMatching(/não somam o total/),
    });
  });
});

describe("parseBoltOrdersReport", () => {
  it("vendas por dia dos pedidos entregues; dinheiro à parte; nunca guarda comentários", () => {
    expect(isBoltOrdersReport(BOLT_ORDERS_CSV)).toBe(true);
    expect(isBoltOrdersReport("a,b,c\n1,2,3")).toBe(false);
    const s = ok(parseBoltOrdersReport(BOLT_ORDERS_CSV));
    expect(s).toMatchObject({
      platform: "bolt_food",
      documentKind: "bolt_orders_report",
      documentNumber: "PEDIDOS-2026-02-27-2026-03-02",
      periodFrom: "2026-02-27",
      periodTo: "2026-03-02",
      ordersCount: 3,
    });
    expect(s.lines).toEqual([
      { kind: "sales", label: "Vendas 27/02 (2 pedidos)", grossCents: 3050, vatCents: 0, date: "2026-02-27" },
      { kind: "cash", label: "Pagos em dinheiro 27/02", grossCents: 1000, vatCents: 0, date: "2026-02-27" },
      { kind: "sales", label: "Vendas 02/03 (1 pedido)", grossCents: 3025, vatCents: 0, date: "2026-03-02" },
    ]);
    expect(s.netPayoutCents).toBe(3050 - 1000 + 3025);
    expect(JSON.stringify(s)).not.toMatch(/Muito bom|Fictícia|AAAA/);
  });
});

describe("parseSaftSales", () => {
  it("faturado e IVA por dia, notas de crédito à parte, anulados fora", () => {
    const text = saftText();
    expect(isSaftSales(text)).toBe(true);
    const s = ok(parseSaftSales(text));
    expect(s).toMatchObject({
      platform: "airmenu",
      documentKind: "airmenu_saft",
      documentNumber: "SAFT-2026-03-01-2026-03-31",
      periodFrom: "2026-03-01",
      periodTo: "2026-03-31",
      ordersCount: 2,
    });
    expect(s.lines).toEqual([
      { kind: "sales", label: "Faturado 01/03 (2 doc.)", grossCents: 3000, vatCents: 345, date: "2026-03-01" },
      { kind: "refund", label: "Notas de crédito 02/03", grossCents: 565, vatCents: 65, date: "2026-03-02" },
    ]);
    expect(sumLines(s, "sales", "vatCents")).toBe(345);
    expect(s.netPayoutCents).toBe(3000 - 565);
    // Produtos por dia (para o custo da comida), nunca o cliente; anulados fora; a nota de crédito abate.
    expect(JSON.stringify(s)).not.toMatch(/999/);
    expect(s.products).toEqual([
      { date: "2026-03-01", code: "P1", description: "Pizza & Teste", quantity: 2, netCents: 2655 },
      { date: "2026-03-02", code: "P1", description: "Pizza & Teste", quantity: -1, netCents: -500 },
    ]);
  });

  it("recusa o SAF-T do Vendus e totais que não conferem", () => {
    expect(parseSaftSales(saftText("Vendus/Teste"))).toEqual({ error: expect.stringMatching(/Vendus/) });
    expect(parseSaftSales(saftText("NET-BO/Teste", "30.00"))).toEqual({ error: expect.stringMatching(/TotalCredit/) });
  });
});

describe("readPlatformDocument", () => {
  it("escolhe o leitor pelo conteúdo para os cinco documentos", () => {
    const kinds = [UBER_MONTHLY_TEXT, GLOVO_STATEMENT_TEXT, BOLT_INVOICE_TEXT, BOLT_ORDERS_CSV, saftText()].map((t) => readPlatformDocument("f", t).documentKind);
    expect(kinds).toEqual(["uber_monthly_statement", "glovo_statement", "bolt_weekly_invoice", "bolt_orders_report", "airmenu_saft"]);
  });
});
