import { StockPurchaseReviewNotFoundError } from "../../domain/errors.js";
import type { StockReviewLine, LineSuggestion } from "../../domain/entities/stock-review-line.js";
import type { StockPurchaseReviewDTO, SuggestReviewMappingsCommand, SuggestReviewMappingsPort } from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { StockPurchaseReviewRepositoryPort } from "../../domain/ports/out/stock-purchase-review-repository.port.js";
import type { StockReviewLearnedMappingPort } from "../../domain/ports/out/stock-review-learned-mapping.port.js";
import type { StockCatalogWritePort } from "../../domain/ports/out/stock-catalog-write.port.js";
import type { StockItemMatchAiPort } from "../../domain/ports/out/stock-item-match-ai.port.js";
import type { CostCenterCategoryReadPort } from "../../domain/ports/out/cost-center-category-read.port.js";
import type { StockAiBudgetPort } from "../../domain/ports/out/ai-budget.port.js";
import { confidentNameMatch, rankCandidates, suggestConversionFactor, type CatalogItem } from "../../domain/services/item-matching.service.js";
import { conferenceFor, normalizeDescription, toStockPurchaseReviewDTO } from "./shared.js";

/** Catálogos até este tamanho vão inteiros à IA; acima disso, só os melhores candidatos por nome. */
const FULL_CATALOG_LIMIT = 80;
const AI_CANDIDATES = 12;
/** Abaixo disto a sugestão da IA não é mostrada. */
const AI_MIN_CONFIDENCE = 0.6;

/**
 * Conciliação das linhas por resolver (F3b): histórico do fornecedor (referência → descrição) →
 * nome claramente igual no catálogo → IA (uma chamada por revisão, só para o que sobra).
 * Grava a sugestão em cada linha (não volta a pagar IA ao reabrir) e nunca resolve sozinha.
 */
export class SuggestReviewMappingsUseCase implements SuggestReviewMappingsPort {
  constructor(
    private readonly repository: StockPurchaseReviewRepositoryPort,
    private readonly learnedMapping: StockReviewLearnedMappingPort,
    private readonly catalog: StockCatalogWritePort,
    private readonly ai: StockItemMatchAiPort | null,
    private readonly categoryRead?: CostCenterCategoryReadPort,
    /** Orçamento diário de IA: esgotado → só histórico e nome. */
    private readonly aiBudget?: StockAiBudgetPort,
  ) {}

  async execute(command: SuggestReviewMappingsCommand): Promise<StockPurchaseReviewDTO> {
    const review = await this.repository.findById(command.organizationId, command.reviewId);
    if (!review) throw new StockPurchaseReviewNotFoundError(command.reviewId);
    const lines = await this.repository.findLinesByReviewId(command.organizationId, command.reviewId);
    const terminal = review.status === "applied" || review.status === "excluded" || review.status === "cancelled";
    const pending = terminal ? [] : lines.filter((l) => l.resolutionType === "unresolved" && (command.refresh || !l.suggestion));

    const updated = new Map<string, StockReviewLine>();
    if (pending.length) {
      const items: CatalogItem[] = (await this.catalog.listActive(command.organizationId)).map((i) => ({ id: i.id, name: i.name, baseUnit: i.baseUnit }));
      const byId = new Map(items.map((i) => [i.id, i]));
      const supplierId = review.toProps().decisionSupplierId;
      const now = new Date();
      const forAi: { line: StockReviewLine; candidates: CatalogItem[] }[] = [];

      for (const line of pending) {
        const learned = supplierId
          ? await this.learnedMapping.suggest(command.organizationId, supplierId, line.supplierItemCode, normalizeDescription(line.description))
          : null;
        if (learned && learned.isItemActive) {
          const packagingChanged =
            learned.resolutionType === "existing_item" && learned.purchaseUnit !== null && learned.purchaseUnit.trim().toLowerCase() !== line.purchaseUnit.trim().toLowerCase();
          const item = learned.stockItemId ? byId.get(learned.stockItemId) : undefined;
          updated.set(line.id, line.withSuggestion({
            source: "learned",
            resolution: learned.resolutionType,
            stockItemId: learned.stockItemId,
            conversionFactor: packagingChanged
              ? item ? suggestConversionFactor(line.description, line.purchaseUnit, item.baseUnit) : null
              : learned.conversionFactor,
            confidence: 1,
            packagingChanged,
            suggestedAt: now,
          }));
          continue;
        }
        const ranked = rankCandidates(line.description, items, AI_CANDIDATES);
        const clear = confidentNameMatch(ranked);
        if (clear) {
          updated.set(line.id, line.withSuggestion(this.itemSuggestion("name_match", clear.item, clear.score, line, now)));
          continue;
        }
        forAi.push({ line, candidates: items.length <= FULL_CATALOG_LIMIT ? items : ranked.map((r) => r.item) });
      }

      const aiAllowed = forAi.length > 0 && this.ai !== null && (!this.aiBudget || (await this.aiBudget.consume(command.organizationId, "stock_match").catch(() => ({ allowed: true }))).allowed);
      if (forAi.length && this.ai && aiAllowed) {
        try {
          const results = await this.ai.match(
            forAi.map((f, index) => ({ index, description: f.line.description, purchaseUnit: f.line.purchaseUnit, candidates: f.candidates.map((c) => ({ id: c.id, name: c.name, baseUnit: c.baseUnit })) })),
          );
          for (const r of results) {
            const f = forAi[r.index];
            if (!f || r.confidence < AI_MIN_CONFIDENCE || !r.resolution) continue;
            if (r.resolution === "no_stock_effect") {
              updated.set(f.line.id, f.line.withSuggestion({ source: "ai", resolution: "no_stock_effect", stockItemId: null, conversionFactor: null, confidence: r.confidence, packagingChanged: false, suggestedAt: now }));
              continue;
            }
            const item = r.stockItemId ? f.candidates.find((c) => c.id === r.stockItemId) : undefined;
            if (!item) continue; // fora dos candidatos desta linha → ignorado
            const deterministic = suggestConversionFactor(f.line.description, f.line.purchaseUnit, item.baseUnit);
            const aiFactor = r.conversionFactor !== null && Number.isFinite(r.conversionFactor) && r.conversionFactor > 0 ? r.conversionFactor : null;
            updated.set(f.line.id, f.line.withSuggestion({ source: "ai", resolution: "existing_item", stockItemId: item.id, conversionFactor: deterministic ?? aiFactor, confidence: r.confidence, packagingChanged: false, suggestedAt: now }));
          }
        } catch (e) {
          // A IA é uma ajuda: falhar nunca impede a revisão manual.
          console.error("[stock-purchase-review] conciliação por IA falhou (ignorada):", e instanceof Error ? e.message : e);
        }
      }

      // Procurou-se e não houve nada: marca para não repetir a cada abertura.
      for (const line of pending) {
        if (!updated.has(line.id)) {
          updated.set(line.id, line.withSuggestion({ source: "none", resolution: null, stockItemId: null, conversionFactor: null, confidence: null, packagingChanged: false, suggestedAt: now }));
        }
      }
      for (const line of updated.values()) await this.repository.saveLine(command.organizationId, line);
    }

    const finalLines = lines.map((l) => updated.get(l.id) ?? l);
    const conference = this.categoryRead ? await conferenceFor(command.organizationId, review, finalLines, this.categoryRead) : undefined;
    return toStockPurchaseReviewDTO(review, finalLines, conference);
  }

  private itemSuggestion(source: "name_match", item: CatalogItem, score: number, line: StockReviewLine, now: Date): LineSuggestion {
    return {
      source,
      resolution: "existing_item",
      stockItemId: item.id,
      conversionFactor: suggestConversionFactor(line.description, line.purchaseUnit, item.baseUnit),
      confidence: score,
      packagingChanged: false,
      suggestedAt: now,
    };
  }
}
