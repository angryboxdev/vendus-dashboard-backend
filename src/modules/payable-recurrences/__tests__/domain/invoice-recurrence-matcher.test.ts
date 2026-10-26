import { Recurrence } from "../../domain/entities/recurrence.js";
import {
  candidateMonthsForInvoice,
  matchRecurrencesForInvoice,
  namesLookAlike,
} from "../../domain/services/invoice-recurrence-matcher.js";

// Dados fictícios.
function rec(
  name: string,
  opts: { supplierId?: string | null; supplierName?: string; costCenterId?: string | null; costCenterCategoryId?: string | null } = {},
) {
  return Recurrence.create({
    name,
    supplierId: opts.supplierId === undefined ? "sup-1" : opts.supplierId,
    supplierName: opts.supplierName ?? "Fornecedor Teste",
    type: "variable_invoice",
    costCenterId: opts.costCenterId ?? null,
    costCenterCategoryId: opts.costCenterCategoryId ?? null,
    estimatedAmountCents: 10000,
    dayOfMonth: 10,
    startDate: new Date(2026, 0, 1),
    paymentMethod: "transfer",
  });
}

const INV = { supplierId: "sup-1", supplierName: "Fornecedor Teste", costCenterGroupId: null, costCenterCategoryId: null };
const names = (ms: { recurrence: { name: string }; matchedBy: string }[]) => ms.map((m) => [m.recurrence.name, m.matchedBy]);

describe("matchRecurrencesForInvoice — pelo fornecedor", () => {
  it("só recorrências ativas do mesmo fornecedor", () => {
    const a = rec("Luz");
    const b = rec("Outro", { supplierId: "sup-2" });
    const paused = rec("Pausada").pause();
    expect(names(matchRecurrencesForInvoice(INV, [a, b, paused]))).toEqual([["Luz", "supplier"]]);
  });

  it("desempata pela sub-categoria e depois pela categoria", () => {
    const luz = rec("Luz", { costCenterId: "g-util", costCenterCategoryId: "c-luz" });
    const agua = rec("Água", { costCenterId: "g-util", costCenterCategoryId: "c-agua" });
    const renda = rec("Renda", { costCenterId: "g-inst" });
    expect(names(matchRecurrencesForInvoice({ ...INV, costCenterCategoryId: "c-agua" }, [luz, agua, renda]))).toEqual([["Água", "supplier"]]);
    expect(names(matchRecurrencesForInvoice({ ...INV, costCenterGroupId: "g-inst" }, [luz, agua, renda]))).toEqual([["Renda", "supplier"]]);
    expect(matchRecurrencesForInvoice({ ...INV, costCenterGroupId: "g-util" }, [luz, agua, renda])).toHaveLength(2);
  });

  it("uma categoria que não bate com nenhuma não exclui os candidatos", () => {
    const luz = rec("Luz", { costCenterCategoryId: "c-luz" });
    const agua = rec("Água", { costCenterCategoryId: "c-agua" });
    expect(matchRecurrencesForInvoice({ ...INV, costCenterCategoryId: "c-gas" }, [luz, agua])).toHaveLength(2);
  });

  it("o valor nunca entra (o previsto é estimado)", () => {
    const a = rec("Luz");
    expect(names(matchRecurrencesForInvoice(INV, [a]))).toEqual([["Luz", "supplier"]]);
  });
});

describe("matchRecurrencesForInvoice — sem o mesmo fornecedor: categoria + nome", () => {
  const WATER_INV = { supplierId: "sup-aguas-porto", supplierName: "Águas e Energia do Porto", costCenterGroupId: "g-util", costCenterCategoryId: "c-agua" };

  it("recorrência sem fornecedor, mesma sub-categoria e nome parecido («Água» ↔ «Águas …») → candidata (só sugestão)", () => {
    const agua = rec("Água", { supplierId: null, supplierName: "Água loja", costCenterId: "g-util", costCenterCategoryId: "c-agua" });
    expect(names(matchRecurrencesForInvoice(WATER_INV, [agua]))).toEqual([["Água", "category_name"]]);
  });

  it("outro fornecedor na recorrência, mas categoria e nome batem → candidata", () => {
    const agua = rec("Água", { supplierId: "sup-antigo", costCenterId: "g-util", costCenterCategoryId: "c-agua" });
    expect(names(matchRecurrencesForInvoice(WATER_INV, [agua]))).toEqual([["Água", "category_name"]]);
  });

  it("só a categoria não chega (nome diferente) e só o nome não chega (categoria diferente)", () => {
    const luz = rec("Luz", { supplierId: null, costCenterId: "g-util", costCenterCategoryId: "c-agua" });
    const aguaOutraCat = rec("Água", { supplierId: null, costCenterId: "g-inst", costCenterCategoryId: "c-renda" });
    expect(matchRecurrencesForInvoice(WATER_INV, [luz, aguaOutraCat])).toEqual([]);
  });

  it("havendo pelo fornecedor, as de categoria + nome não aparecem", () => {
    const porFornecedor = rec("Água e saneamento", { supplierId: "sup-aguas-porto" });
    const porNome = rec("Água", { supplierId: null, costCenterId: "g-util", costCenterCategoryId: "c-agua" });
    expect(names(matchRecurrencesForInvoice(WATER_INV, [porFornecedor, porNome]))).toEqual([["Água e saneamento", "supplier"]]);
  });

  it("pode haver mais de uma candidata por categoria + nome", () => {
    const loja = rec("Água loja", { supplierId: null, costCenterId: "g-util", costCenterCategoryId: "c-agua" });
    const armazem = rec("Água armazém", { supplierId: null, costCenterId: "g-util", costCenterCategoryId: "c-agua" });
    expect(matchRecurrencesForInvoice(WATER_INV, [loja, armazem])).toHaveLength(2);
  });

  it("fatura sem fornecedor no cadastro também encontra por categoria + nome", () => {
    const agua = rec("Água", { supplierId: null, costCenterId: "g-util", costCenterCategoryId: "c-agua" });
    expect(names(matchRecurrencesForInvoice({ ...WATER_INV, supplierId: null }, [agua]))).toEqual([["Água", "category_name"]]);
  });
});

describe("namesLookAlike", () => {
  it("ignora acentos, maiúsculas, plural simples e palavras genéricas", () => {
    expect(namesLookAlike({ name: "Água", supplierName: "" }, "ÁGUAS E ENERGIA DO PORTO, EM")).toBe(true);
    expect(namesLookAlike({ name: "Contabilidade", supplierName: "Gabinete Exemplo Lda" }, "Gabinete Exemplo, Lda")).toBe(true);
    expect(namesLookAlike({ name: "Renda", supplierName: "Senhorio Lda" }, "Empresa Municipal Lda")).toBe(false);
    expect(namesLookAlike({ name: "Gás", supplierName: "" }, "Gás Natural")).toBe(false); // < 4 letras
  });
});

describe("candidateMonthsForInvoice", () => {
  it("mês da emissão e depois o anterior (incluindo a passagem de ano)", () => {
    expect(candidateMonthsForInvoice("2026-10-03")).toEqual([{ year: 2026, month: 10 }, { year: 2026, month: 9 }]);
    expect(candidateMonthsForInvoice("2027-01-05")).toEqual([{ year: 2027, month: 1 }, { year: 2026, month: 12 }]);
  });
});
