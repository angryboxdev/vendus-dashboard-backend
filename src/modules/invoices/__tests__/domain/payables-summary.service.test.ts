import { civilDate, summarizePayables, type LedgerDocument } from "../../domain/services/payables-summary.service.js";

const doc = (over: Partial<LedgerDocument> & { id: string }): LedgerDocument => ({
  kind: "invoice",
  documentType: "invoice",
  settled: false,
  totalCents: 20000,
  allocatedCents: 0,
  dueDate: "2026-10-20",
  listingDate: "2026-10-01",
  currency: "EUR",
  supplierId: "sup-a",
  searchText: "Makro FT 1",
  locationIds: new Set(),
  duplicateWarning: false,
  ...over,
});
const TODAY = "2026-10-14";

describe("Total a pagar | Em atraso (F2 §2.3)", () => {
  test("200 € − pagamento reconhecido 50 € = 150 € (saldo aberto, não o valor original)", () => {
    const r = summarizePayables([doc({ id: "a", allocatedCents: 5000 })], {}, TODAY);
    expect(r.totalOpenCents).toBe(15000);
  });

  test("prestações: várias alocações somadas; paga por completo sai do total; marcada como paga = 0", () => {
    const r = summarizePayables(
      [doc({ id: "a", allocatedCents: 5000 + 5000 }), doc({ id: "b", allocatedCents: 20000 }), doc({ id: "c", settled: true })],
      {},
      TODAY,
    );
    expect(r).toMatchObject({ totalOpenCents: 10000, documents: 1 });
  });

  test("nota de crédito aplicada conta uma vez (já está nas alocações); não aplicada aparece à parte", () => {
    // Fatura 200 € liquidada em agrupado com NC 50 €: a fatura tem 200 € alocados, a NC também está alocada.
    const r = summarizePayables(
      [doc({ id: "inv", allocatedCents: 20000 }), doc({ id: "nc", documentType: "credit_note", totalCents: 5000, allocatedCents: 5000 }), doc({ id: "nc2", documentType: "credit_note", totalCents: 3000 })],
      {},
      TODAY,
    );
    expect(r).toMatchObject({ totalOpenCents: 0, overdueCents: 0, unappliedCreditCents: 3000 });
  });

  test("vence hoje não está atrasado; ontem está; sem vencimento entra na dívida e é sinalizado", () => {
    const r = summarizePayables(
      [doc({ id: "hoje", dueDate: TODAY }), doc({ id: "ontem", dueDate: "2026-10-13" }), doc({ id: "sem", dueDate: null })],
      {},
      TODAY,
    );
    expect(r).toMatchObject({ totalOpenCents: 60000, overdueCents: 20000, missingDueDate: { count: 1, cents: 20000 } });
    expect(r.overdueCents).toBeLessThanOrEqual(r.totalOpenCents);
  });

  test("passagem do dia: o que vencia hoje passa a atrasado amanhã", () => {
    const docs = [doc({ id: "a", dueDate: TODAY })];
    expect(summarizePayables(docs, {}, TODAY).overdueCents).toBe(0);
    expect(summarizePayables(docs, {}, "2026-10-15").overdueCents).toBe(20000);
  });

  test("data civil no fuso da entidade (Lisboa às 23h30 UTC de dia 14 já é dia 15)", () => {
    expect(civilDate(new Date("2026-10-14T23:30:00Z"), "Europe/Lisbon")).toBe("2026-10-15");
    expect(civilDate(new Date("2026-10-14T23:30:00Z"), "UTC")).toBe("2026-10-14");
  });

  test("filtros: pesquisa, período (data da listagem), fornecedor; não é «dívida global» de um mês filtrado", () => {
    const docs = [
      doc({ id: "a", searchText: "Makro FT 1", listingDate: "2026-10-02" }),
      doc({ id: "b", searchText: "EDP 99", listingDate: "2026-09-10", supplierId: "sup-edp" }),
    ];
    expect(summarizePayables(docs, { search: "makro" }, TODAY).totalOpenCents).toBe(20000);
    expect(summarizePayables(docs, { from: "2026-10-01", to: "2026-10-31" }, TODAY).totalOpenCents).toBe(20000);
    expect(summarizePayables(docs, { supplierId: "sup-edp" }, TODAY).totalOpenCents).toBe(20000);
    expect(summarizePayables(docs, {}, TODAY).totalOpenCents).toBe(40000);
  });

  test("loja: documento multiloja conta uma vez e é sinalizado (saldo do documento, sem rateio)", () => {
    const docs = [doc({ id: "a", locationIds: new Set(["mbs", "porto"]) }), doc({ id: "b", locationIds: new Set(["porto"]) })];
    const r = summarizePayables(docs, { locationId: "mbs" }, TODAY);
    expect(r).toMatchObject({ totalOpenCents: 20000, documents: 1, multiLocationDocuments: 1 });
  });

  test("moedas não se misturam; duplicado suspeito mantém o saldo com aviso", () => {
    const r = summarizePayables([doc({ id: "a", duplicateWarning: true }), doc({ id: "usd", currency: "USD" })], {}, TODAY);
    expect(r).toMatchObject({ currency: "EUR", totalOpenCents: 20000, suspectedDuplicates: 1, otherCurrencies: ["USD"] });
  });
});
