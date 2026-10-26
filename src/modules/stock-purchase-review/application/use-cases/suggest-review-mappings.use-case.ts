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
import { invoiceLineToStock, invoiceQuantityUnit } from "../../domain/services/presentation-conversion.service.js";
import { isDepositLine } from "../../domain/services/deposit-line.service.js";
import { PurchasePresentation, type PurchasePresentationProps } from "../../domain/entities/purchase-presentation.js";
import type { StockReviewAuditLogPort } from "../../domain/ports/out/stock-review-audit-log.port.js";
import type { EntryRulesRepositoryPort } from "../../domain/ports/out/entry-rules-repository.port.js";
import { effectiveRules, modeForItemType } from "../../domain/services/entry-rules.service.js";
import { validateConversion } from "../../domain/services/unit-conversion.service.js";
import { parsePackSize } from "../../domain/services/item-matching.service.js";
import { unitFactor } from "../../domain/services/presentation-conversion.service.js";

/** Quem resolve as linhas com decisão já confirmada (visível na revisão como «associação confirmada»). */
export const AUTO_RESOLVED_BY = "sistema · associação confirmada";
/** Depósito de embalagem (latas/garrafas): devolvível, nunca entra no Stock. */
export const DEPOSIT_RESOLVED_BY = "sistema · depósito de embalagem";

/** EAN-8/12/13/14 com dígito de controlo válido. */
export function isEan(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** A descrição traz um tamanho de embalagem diferente do confirmado (1 kg vs saco de 2,5 kg)? */
export function packageSizeConflict(description: string, p: Pick<PurchasePresentationProps, "packageUnit" | "contentQuantity" | "contentUnit">): boolean {
  if (!p.packageUnit) return false;
  const size = parsePackSize(description)?.size;
  if (!size) return false;
  const unit = size.unit === "gr" ? "g" : size.unit === "lt" || size.unit === "lts" ? "l" : size.unit;
  const f = unitFactor(unit, p.contentUnit);
  return f === null || Math.abs(size.quantity * f - p.contentQuantity) > 0.000001;
}
import { conferenceFor, normalizeDescription, toStockPurchaseReviewDTO , withCategoryLabels } from "./shared.js";
import { withPackaging, type PackagingDeps } from "./shared-packaging.js";

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
    /** Embalagem de compra de cada linha (opcional nos testes antigos). */
    private readonly packaging?: PackagingDeps,
    private readonly auditLog?: StockReviewAuditLogPort,
    /** Regras de entrada no Stock por tipo de artigo (V4 §2). */
    private readonly entryRules?: EntryRulesRepositoryPort,
  ) {}

  async execute(command: SuggestReviewMappingsCommand): Promise<StockPurchaseReviewDTO> {
    const review = await this.repository.findById(command.organizationId, command.reviewId);
    if (!review) throw new StockPurchaseReviewNotFoundError(command.reviewId);
    const lines = await this.repository.findLinesByReviewId(command.organizationId, command.reviewId);
    const terminal = review.status === "applied" || review.status === "excluded" || review.status === "cancelled";
    const pending = terminal ? [] : lines.filter((l) => l.resolutionType === "unresolved" && (command.refresh || !l.suggestion));

    const updated = new Map<string, StockReviewLine>();
    let reviewAfter = review;
    if (pending.length) {
      const catalogItems = await this.catalog.listActive(command.organizationId);
      const items: CatalogItem[] = catalogItems.map((i) => ({ id: i.id, name: i.name, baseUnit: i.baseUnit }));
      const typeOf = new Map(catalogItems.map((i) => [i.id, i.type ?? null]));
      const rules = this.entryRules ? effectiveRules(await this.entryRules.list(command.organizationId)) : null;
      const byId = new Map(items.map((i) => [i.id, i]));
      const supplierId = review.toProps().decisionSupplierId;
      const now = new Date();
      const forAi: { line: StockReviewLine; candidates: CatalogItem[] }[] = [];
      /** Linhas com decisão confirmada por pessoas (embalagem ou associação aprendida) — resolvem-se sozinhas. */
      const confirmed = new Set<string>();
      /** Linhas de depósito de embalagem — fora do Stock sem perguntar (marcadas, corrigíveis). */
      const deposits = new Set<string>();

      const presentations = supplierId && this.packaging ? await this.packaging.presentations.listActiveBySupplier(command.organizationId, supplierId) : [];
      const presByKey = new Map(presentations.map((pr) => [PurchasePresentation.matchKey(pr.toProps().supplierReference, normalizeDescription(pr.toProps().description)), pr] as const));
      for (const line of pending) {
        if (isDepositLine(line.description)) {
          updated.set(line.id, line.withSuggestion({ source: "learned", resolution: "no_stock_effect", stockItemId: null, conversionFactor: null, confidence: 1, packagingChanged: false, suggestedAt: now }));
          confirmed.add(line.id);
          deposits.add(line.id);
          continue;
        }
        // Embalagem confirmada pelo utilizador: artigo e fator vêm dela (fatura em sacos ou em kg).
        const pres = (line.supplierItemCode ? presByKey.get(PurchasePresentation.matchKey(line.supplierItemCode, "")) : undefined) ?? presByKey.get(PurchasePresentation.matchKey(null, normalizeDescription(line.description)));
        const presItem = pres ? byId.get(pres.stockItemId) : undefined;
        const invoiceUnit = invoiceQuantityUnit(line.purchaseUnit, line.description);
        const presFactor = pres && presItem ? invoiceLineToStock(pres.toProps(), 1, 1, presItem.baseUnit, invoiceUnit)?.conversionFactor ?? null : null;
        if (pres && presItem && presFactor) {
          // A descrição diz outro tamanho (ex.: «1 kg» com o saco de 2,5 kg confirmado) → embalagem nova: pergunta uma vez.
          const conflict = packageSizeConflict(line.description, pres.toProps());
          updated.set(line.id, line.withSuggestion({ source: "learned", resolution: "existing_item", stockItemId: presItem.id, conversionFactor: conflict ? null : presFactor, confidence: 1, packagingChanged: conflict, suggestedAt: now }));
          if (!conflict) confirmed.add(line.id);
          continue;
        }
        const learned = supplierId
          ? await this.learnedMapping.suggest(command.organizationId, supplierId, line.supplierItemCode, normalizeDescription(line.description))
          : null;
        if (learned && learned.isItemActive) {
          const item = learned.stockItemId ? byId.get(learned.stockItemId) : undefined;
          // A fatura diz em que unidade conta (ex.: kg) e o fator aprendido fica abaixo de 1 kg em g
          // (1 em vez de 1000) → pergunta de novo. Um fator maior (saco de 25 kg) continua válido.
          const unitFactorFromInvoice = item && invoiceUnit ? unitFactor(invoiceUnit, item.baseUnit) : null;
          const packagingChanged =
            (learned.resolutionType === "existing_item" && learned.purchaseUnit !== null && learned.purchaseUnit.trim().toLowerCase() !== line.purchaseUnit.trim().toLowerCase()) ||
            (learned.resolutionType === "existing_item" && unitFactorFromInvoice !== null && learned.conversionFactor !== null && learned.conversionFactor < unitFactorFromInvoice);
          // Decisão confirmada por uma pessoa para esta linha (fornecedor + referência/descrição): aplica-se sozinha.
          if (!packagingChanged && (learned.resolutionType === "no_stock_effect" || (item && learned.conversionFactor))) confirmed.add(line.id);
          updated.set(line.id, line.withSuggestion({
            source: "learned",
            resolution: learned.resolutionType,
            stockItemId: learned.stockItemId,
            conversionFactor: packagingChanged
              ? item ? (unitFactorFromInvoice ?? suggestConversionFactor(line.description, line.purchaseUnit, item.baseUnit)) : null
              : learned.conversionFactor,
            confidence: 1,
            packagingChanged,
            suggestedAt: now,
          }));
          continue;
        }
        // EAN já associado noutro fornecedor (confirmado lá): ajuda como proposta, sem copiar preços.
        if (line.supplierItemCode && isEan(line.supplierItemCode) && this.learnedMapping.suggestByReference) {
          const byEan = await this.learnedMapping.suggestByReference(command.organizationId, line.supplierItemCode);
          const eanItem = byEan?.stockItemId ? byId.get(byEan.stockItemId) : undefined;
          if (byEan && byEan.resolutionType === "existing_item" && eanItem) {
            updated.set(line.id, line.withSuggestion({ source: "learned", resolution: "existing_item", stockItemId: eanItem.id, conversionFactor: byEan.purchaseUnit && byEan.purchaseUnit.toLowerCase() === line.purchaseUnit.toLowerCase() ? byEan.conversionFactor : suggestConversionFactor(line.description, line.purchaseUnit, eanItem.baseUnit), confidence: 0.9, packagingChanged: false, suggestedAt: now }));
            continue;
          }
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
      // Regra da empresa pelo tipo do artigo proposto (só onde não há decisão confirmada): tipo «fora do
      // Stock» (ex.: Higiene/Limpeza) → a proposta passa a «Não é item de stock». Continua a ser proposta.
      if (rules) {
        for (const [id, line] of updated) {
          if (confirmed.has(id)) continue;
          const sg = line.suggestion;
          if (!sg || sg.source === "none" || sg.resolution !== "existing_item" || !sg.stockItemId) continue;
          if (modeForItemType(rules, typeOf.get(sg.stockItemId)) === "no_stock") {
            updated.set(id, line.withSuggestion({ ...sg, resolution: "no_stock_effect", stockItemId: null, conversionFactor: null }));
          }
        }
      }

      // «Ensinar uma vez»: o que já foi confirmado para esta linha resolve-se sem perguntas (fica marcado e pode ser corrigido).
      for (const id of confirmed) {
        const line = updated.get(id)!;
        const sg = line.suggestion!;
        if (sg.resolution === "no_stock_effect") {
          updated.set(id, line.resolveAsNoStockEffect(deposits.has(id) ? DEPOSIT_RESOLVED_BY : AUTO_RESOLVED_BY));
        } else if (sg.stockItemId && sg.conversionFactor) {
          const item = byId.get(sg.stockItemId)!;
          const check = validateConversion(line.purchaseUnit, item.baseUnit);
          updated.set(id, line.resolveToStockItem({ stockItemId: item.id, conversionFactor: sg.conversionFactor, isItemActive: true, flaggedSuspiciousConversion: check.flagged, flagReason: check.reason }, false, AUTO_RESOLVED_BY));
        }
      }
      for (const line of updated.values()) await this.repository.saveLine(command.organizationId, line);
      if (confirmed.size > 0) {
        const all = lines.map((l) => updated.get(l.id) ?? l);
        const refreshed = review.refreshLinesProgress(all.every((l) => l.resolutionType !== "unresolved"), all.some((l) => l.resolutionType !== "unresolved"));
        if (refreshed !== review) await this.repository.save(command.organizationId, refreshed, review.version);
        reviewAfter = refreshed;
        await this.auditLog?.record({
          organizationId: command.organizationId,
          actor: AUTO_RESOLVED_BY,
          entityType: "stock_purchase_review",
          entityId: review.id,
          action: "auto_resolve_confirmed",
          after: { lines: [...confirmed] },
        });
      }
    }

    const finalLines = lines.map((l) => updated.get(l.id) ?? l);
    const review_ = reviewAfter;
    const conference = this.categoryRead ? await conferenceFor(command.organizationId, review_, finalLines, this.categoryRead) : undefined;
    return withCategoryLabels(command.organizationId, await withPackaging(command.organizationId, toStockPurchaseReviewDTO(review_, finalLines, conference), this.packaging), this.categoryRead);
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
