import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ClassifyInvoiceLinesUseCase } from "../../application/use-cases/classify-invoice-lines.use-case.js";
import type { CategoryCatalogReadPort, ConfirmedLineHistoryPort, LineCategoryAiPort } from "../../domain/ports/out/line-classification.ports.js";
import type { CatalogEntry, ConfirmedLine } from "../../domain/services/classification/line-classifier.js";

const ORG = mintOrganizationId("org-test");
const catalog: CatalogEntry[] = [
  { id: "c-ing", code: "OPD.01", name: "Ingredientes", groupName: "Operação Direta", isActive: true },
  { id: "c-cap", code: "CAP.01", name: "Equipamentos", groupName: "Investimentos", isActive: true },
  { id: "c-off", code: "ZZZ.01", name: "Desativada", groupName: "Outros", isActive: false },
];
const catalogPort: CategoryCatalogReadPort = { list: async () => catalog };
const historyPort = (rows: ConfirmedLine[] = []): ConfirmedLineHistoryPort & { calls: number } => ({ calls: 0, async forSupplier() { this.calls++; return rows; } });
const lines = [
  { index: 0, kind: "product" as const, supplierCode: null, description: "TOMATE PELADO 2,5KG" },
  { index: 1, kind: "product" as const, supplierCode: null, description: "ARM REFRIG GSC2360" },
  { index: 2, kind: "product" as const, supplierCode: null, description: "COISA DESCONHECIDA" },
];

class FakeAi implements LineCategoryAiPort {
  received: { index: number; description: string }[] = [];
  constructor(private readonly answer: Record<number, string | null>, private readonly fail = false) {}
  async suggest(ls: { index: number; description: string }[]) {
    this.received = ls;
    if (this.fail) throw new Error("rede");
    return ls.map((l) => ({ index: l.index, categoryId: this.answer[l.index] ?? null }));
  }
}

describe("ClassifyInvoiceLinesUseCase", () => {
  test("IA só recebe as linhas que as regras não resolveram", async () => {
    const ai = new FakeAi({ 1: "c-cap", 2: null });
    const r = await new ClassifyInvoiceLinesUseCase(catalogPort, historyPort(), ai).execute(ORG, { supplierId: "s1", lines });
    expect(ai.received.map((l) => l.index)).toEqual([1, 2]);
    expect(r.classifications.map((c) => [c.categoryId, c.source])).toEqual([["c-ing", "keyword"], ["c-cap", "ai"], [null, "none"]]);
    expect(r.metrics).toEqual({ lines: 3, deterministic: 1, aiRequested: 2, aiResolved: 1, aiError: false });
  });

  test("id inventado ou de subcategoria inativa devolvido pela IA é ignorado", async () => {
    const r = await new ClassifyInvoiceLinesUseCase(catalogPort, historyPort(), new FakeAi({ 1: "nao-existe", 2: "c-off" })).execute(ORG, { supplierId: null, lines });
    expect(r.classifications.slice(1).map((c) => c.categoryId)).toEqual([null, null]);
    expect(r.metrics.aiResolved).toBe(0);
  });

  test("falha da IA não afeta as linhas já classificadas", async () => {
    const r = await new ClassifyInvoiceLinesUseCase(catalogPort, historyPort(), new FakeAi({}, true)).execute(ORG, { supplierId: "s1", lines });
    expect(r.classifications[0]!.categoryId).toBe("c-ing");
    expect(r.metrics.aiError).toBe(true);
  });

  test("sem IA configurada: só regras e histórico; sem fornecedor não lê histórico", async () => {
    const history = historyPort();
    const r = await new ClassifyInvoiceLinesUseCase(catalogPort, history, null).execute(ORG, { supplierId: null, lines });
    expect(history.calls).toBe(0);
    expect(r.metrics.aiRequested).toBe(0);
    expect(r.classifications.filter((c) => c.categoryId).length).toBe(1);
  });

  test("linha com histórico em conflito não vai à IA", async () => {
    const ai = new FakeAi({ 0: "c-cap" });
    const conflicting = [
      { supplierCode: null, description: "TOMATE PELADO 2,5KG", categoryId: "c-ing" },
      { supplierCode: null, description: "TOMATE PELADO 2,5KG", categoryId: "c-cap" },
    ];
    const r = await new ClassifyInvoiceLinesUseCase(catalogPort, historyPort(conflicting), ai).execute(ORG, { supplierId: "s1", lines: [lines[0]!] });
    expect(ai.received).toEqual([]);
    expect(r.classifications[0]).toMatchObject({ categoryId: null, conflict: true });
  });
});
