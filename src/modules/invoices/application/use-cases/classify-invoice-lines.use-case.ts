import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { CategoryCatalogReadPort, ConfirmedLineHistoryPort, LineCategoryAiPort } from "../../domain/ports/out/line-classification.ports.js";
import { classifyLinesDeterministic, type LineToClassify } from "../../domain/services/classification/line-classifier.js";
import type { ClassifyInvoiceLinesPort, ClassifyInvoiceLinesResult } from "../../domain/ports/in/classify-invoice-lines.port.js";

const HISTORY_LIMIT = 500;
/** Uma chamada por fatura, no máximo com este número de linhas (o resto fica para revisão). */
const AI_MAX_LINES = 120;

/** Classifica as linhas reais de uma fatura: regras/histórico primeiro, IA só no que sobra. */
export class ClassifyInvoiceLinesUseCase implements ClassifyInvoiceLinesPort {
  constructor(
    private readonly catalog: CategoryCatalogReadPort,
    private readonly history: ConfirmedLineHistoryPort,
    private readonly ai: LineCategoryAiPort | null,
  ) {}

  async execute(organizationId: OrganizationId, input: { supplierId: string | null; lines: LineToClassify[] }): Promise<ClassifyInvoiceLinesResult> {
    const [catalog, history] = await Promise.all([
      this.catalog.list(organizationId),
      input.supplierId ? this.history.forSupplier(organizationId, input.supplierId, HISTORY_LIMIT) : Promise.resolve([]),
    ]);
    const result = classifyLinesDeterministic({ lines: input.lines, catalog, history });
    const deterministic = result.filter((c) => c.categoryId !== null).length;
    const pending = result.filter((c) => c.source === "none" && !c.conflict).slice(0, AI_MAX_LINES);
    const metrics = { lines: input.lines.length, deterministic, aiRequested: 0, aiResolved: 0, aiError: false };
    if (!this.ai || !pending.length) return { classifications: result, metrics };

    const active = catalog.filter((c) => c.isActive);
    const byId = new Map(active.map((c) => [c.id, c]));
    const descriptions = new Map(input.lines.map((l) => [l.index, l.description]));
    metrics.aiRequested = pending.length;
    try {
      const answers = await this.ai.suggest(
        pending.map((p) => ({ index: p.index, description: descriptions.get(p.index) ?? "" })),
        active.map((c) => ({ id: c.id, code: c.code, label: `${c.groupName} › ${c.name}` })),
      );
      for (const a of answers) {
        const target = result.find((c) => c.index === a.index && c.source === "none");
        const cat = a.categoryId ? byId.get(a.categoryId) : undefined;
        // Só ids que existem no catálogo ativo da organização; o resto fica por rever.
        if (!target || !cat) continue;
        Object.assign(target, { categoryId: cat.id, source: "ai", evidence: `Sugestão da IA: ${cat.groupName} › ${cat.name}.` });
        metrics.aiResolved++;
      }
    } catch {
      metrics.aiError = true;
    }
    return { classifications: result, metrics };
  }
}
