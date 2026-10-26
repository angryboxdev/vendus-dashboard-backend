import {
  categorizeDebit,
  collectExpenseReferences,
  distribute,
  invoiceSplit,
} from "../../domain/services/expense-categorizer.service.js";
import { catalog, debit, emptySources } from "../fakes/builders.js";

describe("distribute", () => {
  it("reparte em cêntimos inteiros e soma sempre o total", () => {
    expect(distribute(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(distribute(1000, [3, 1])).toEqual([750, 250]);
    expect(distribute(500, [0, 0])).toEqual([500, 0]);
  });
});

describe("invoiceSplit", () => {
  it("«Por valores» usa as repartições; «Por artigo» as linhas (sem categoria → cabeçalho); «Única» o cabeçalho", () => {
    const header = { groupId: null, categoryId: "c-ing" };
    expect(
      invoiceSplit({ mode: "by_values", ...header, allocations: [{ groupId: null, categoryId: "c-sal", weight: 300 }], lines: [] }),
    ).toEqual([{ groupId: null, categoryId: "c-sal", weight: 300 }]);
    expect(
      invoiceSplit({
        mode: "detailed",
        ...header,
        allocations: [],
        lines: [
          { groupId: null, categoryId: "c-enc", weight: 100 },
          { groupId: null, categoryId: null, weight: 50 },
        ],
      }),
    ).toEqual([
      { groupId: null, categoryId: "c-enc", weight: 100 },
      { groupId: null, categoryId: "c-ing", weight: 50 },
    ]);
    expect(invoiceSplit({ mode: "simple", ...header, allocations: [], lines: [] })).toEqual([{ ...header, weight: 1 }]);
  });
});

describe("categorizeDebit", () => {
  it("sem nada: fica sem categoria (vai para o tipo genérico do banco)", () => {
    expect(categorizeDebit(debit(), emptySources(), catalog)).toEqual([{ groupId: null, categoryId: null, amountCents: 10_000 }]);
  });

  it("a categoria do próprio movimento ganha a tudo e o grupo sai da categoria", () => {
    const sources = emptySources();
    sources.invoices.set("inv1", { mode: "simple", groupId: null, categoryId: "c-ing", allocations: [], lines: [] });
    const m = debit({ categoryId: "c-sal", links: [{ entityType: "invoice", entityId: "inv1", amountCents: 10_000 }] });
    expect(categorizeDebit(m, sources, catalog)).toEqual([{ groupId: "g-pes", categoryId: "c-sal", amountCents: 10_000 }]);
  });

  it("transferência enviada conciliada com faturas: reparte na proporção do valor ligado a cada uma", () => {
    const sources = emptySources();
    sources.invoices.set("sal", { mode: "simple", groupId: null, categoryId: "c-sal", allocations: [], lines: [] });
    sources.invoices.set("enc", { mode: "simple", groupId: null, categoryId: "c-enc", allocations: [], lines: [] });
    const m = debit({
      reconciliationStatus: "conciliado_com_fatura",
      links: [
        { entityType: "invoice", entityId: "sal", amountCents: 7_500 },
        { entityType: "invoice", entityId: "enc", amountCents: 2_500 },
      ],
    });
    expect(categorizeDebit(m, sources, catalog)).toEqual([
      { groupId: "g-pes", categoryId: "c-sal", amountCents: 7_500 },
      { groupId: "g-pes", categoryId: "c-enc", amountCents: 2_500 },
    ]);
  });

  it("conta a pagar: usa a fatura dela, senão o grupo; ocorrência de recorrência: a categoria do contrato", () => {
    const sources = emptySources();
    sources.invoices.set("inv1", { mode: "simple", groupId: null, categoryId: "c-ing", allocations: [], lines: [] });
    sources.payables.set("p1", { invoiceId: "inv1", groupId: null });
    sources.payables.set("p2", { invoiceId: null, groupId: "g-pes" });
    sources.occurrences.set("o1", { invoiceId: null, groupId: null, categoryId: "c-enc" });

    const viaPayable = debit({ matchedEntityType: "payable_entry", matchedEntityId: "p1" });
    const groupOnly = debit({ matchedEntityType: "payable_entry", matchedEntityId: "p2" });
    const viaOccurrence = debit({ matchedEntityType: "recurrence_occurrence", matchedEntityId: "o1" });
    expect(categorizeDebit(viaPayable, sources, catalog)[0]).toMatchObject({ groupId: "g-opd", categoryId: "c-ing" });
    expect(categorizeDebit(groupOnly, sources, catalog)[0]).toMatchObject({ groupId: "g-pes", categoryId: null });
    expect(categorizeDebit(viaOccurrence, sources, catalog)[0]).toMatchObject({ groupId: "g-pes", categoryId: "c-enc" });
  });

  it("grupo que não está no catálogo conta como sem categoria", () => {
    const sources = emptySources();
    sources.payables.set("p1", { invoiceId: null, groupId: "centro-antigo" });
    const m = debit({ matchedEntityType: "payable_entry", matchedEntityId: "p1" });
    expect(categorizeDebit(m, sources, catalog)[0]).toMatchObject({ groupId: null, categoryId: null });
  });
});

describe("collectExpenseReferences", () => {
  it("só pede documentos das saídas sem categoria própria", () => {
    const refs = collectExpenseReferences([
      debit({ links: [{ entityType: "invoice", entityId: "i1", amountCents: 1 }, { entityType: "payable_entry", entityId: "p1", amountCents: 1 }] }),
      debit({ matchedEntityType: "recurrence_occurrence", matchedEntityId: "o1" }),
      debit({ categoryId: "c-sal", matchedEntityType: "invoice", matchedEntityId: "i2" }),
    ]);
    expect(refs).toEqual({ invoiceIds: ["i1"], payableIds: ["p1"], occurrenceIds: ["o1"] });
  });
});
