import { Recurrence } from "../../domain/entities/recurrence.js";
import { candidateMonthsForInvoice, matchRecurrencesForInvoice } from "../../domain/services/invoice-recurrence-matcher.js";

// Dados fictícios.
function rec(name: string, opts: { supplierId?: string | null; costCenterId?: string | null; costCenterCategoryId?: string | null } = {}) {
  return Recurrence.create({
    name,
    supplierId: opts.supplierId === undefined ? "sup-1" : opts.supplierId,
    supplierName: "Fornecedor Teste",
    type: "variable_invoice",
    costCenterId: opts.costCenterId ?? null,
    costCenterCategoryId: opts.costCenterCategoryId ?? null,
    estimatedAmountCents: 10000,
    dayOfMonth: 10,
    startDate: new Date(2026, 0, 1),
    paymentMethod: "transfer",
  });
}

const INV = { supplierId: "sup-1", costCenterGroupId: null, costCenterCategoryId: null };

describe("matchRecurrencesForInvoice", () => {
  it("só recorrências ativas do mesmo fornecedor", () => {
    const a = rec("Luz");
    const b = rec("Outro", { supplierId: "sup-2" });
    const paused = rec("Pausada").pause();
    expect(matchRecurrencesForInvoice(INV, [a, b, paused]).map((r) => r.name)).toEqual(["Luz"]);
  });

  it("fatura sem fornecedor não tem candidatos", () => {
    expect(matchRecurrencesForInvoice({ ...INV, supplierId: null }, [rec("Luz")])).toEqual([]);
  });

  it("desempata pela sub-categoria e depois pela categoria", () => {
    const luz = rec("Luz", { costCenterId: "g-util", costCenterCategoryId: "c-luz" });
    const agua = rec("Água", { costCenterId: "g-util", costCenterCategoryId: "c-agua" });
    const renda = rec("Renda", { costCenterId: "g-inst" });
    expect(matchRecurrencesForInvoice({ ...INV, costCenterCategoryId: "c-agua" }, [luz, agua, renda]).map((r) => r.name)).toEqual(["Água"]);
    expect(matchRecurrencesForInvoice({ ...INV, costCenterGroupId: "g-inst" }, [luz, agua, renda]).map((r) => r.name)).toEqual(["Renda"]);
    expect(matchRecurrencesForInvoice({ ...INV, costCenterGroupId: "g-util" }, [luz, agua, renda])).toHaveLength(2);
  });

  it("uma categoria que não bate com nenhuma não exclui os candidatos", () => {
    const luz = rec("Luz", { costCenterCategoryId: "c-luz" });
    const agua = rec("Água", { costCenterCategoryId: "c-agua" });
    expect(matchRecurrencesForInvoice({ ...INV, costCenterCategoryId: "c-gas" }, [luz, agua])).toHaveLength(2);
  });
});

describe("candidateMonthsForInvoice", () => {
  it("mês da emissão e depois o anterior (incluindo a passagem de ano)", () => {
    expect(candidateMonthsForInvoice("2026-10-03")).toEqual([{ year: 2026, month: 10 }, { year: 2026, month: 9 }]);
    expect(candidateMonthsForInvoice("2027-01-05")).toEqual([{ year: 2027, month: 1 }, { year: 2026, month: 12 }]);
  });
});
