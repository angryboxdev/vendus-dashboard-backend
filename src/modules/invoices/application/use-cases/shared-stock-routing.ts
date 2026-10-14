import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Invoice } from "../../domain/entities/invoice.js";
import type { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { StockDecisionRequiredError } from "../../domain/errors.js";
import type { StockRoutingPort, StockRoutingView } from "../../domain/ports/out/stock-routing.port.js";
import type { SupplierLookupPort } from "../../domain/ports/out/supplier-lookup.port.js";

/**
 * «Enviar para Stock» ao lançar (F2 v1.2 §2.1). A escolha explícita no
 * documento (force_create / force_skip) prevalece; desmarcar contra a
 * predefinição exige motivo. Pedido «automático»: aplica a sugestão (exceção
 * da loja, fornecedor, categoria); política «Decidir no documento» sem
 * escolha → recusa (ausência de decisão ≠ «Não enviar»). Sem sinal nenhum
 * mantém-se «automático» (comportamento anterior).
 */
export async function resolveStockRouting(
  routing: StockRoutingPort,
  suppliers: SupplierLookupPort,
  organizationId: OrganizationId,
  invoice: Invoice,
  lines: InvoiceLine[],
): Promise<{ invoice: Invoice; suggestion: StockRoutingView }> {
  const lineLocations = [...new Set(lines.map((l) => l.locationId).filter((l): l is string => !!l))];
  const supplier = invoice.supplierId ? await suppliers.findById(organizationId, invoice.supplierId) : null;
  const locationId = lineLocations.length === 1 ? lineLocations[0]! : lineLocations.length === 0 ? (supplier?.defaultLocationId ?? null) : null;
  const categoryIds = [...new Set([...lines.map((l) => l.costCenterCategoryId), invoice.costCenterCategoryId].filter((c): c is string => !!c))];
  const suggestion = await routing.suggest(organizationId, { supplierId: invoice.supplierId, locationId, categoryIds });

  const override = invoice.stockReviewOverride;
  if (override === "force_skip" && suggestion.send === true && !invoice.stockReviewOverrideReason?.trim()) {
    throw new StockDecisionRequiredError("reason_required", `Não enviar para o Stock contraria a predefinição (${suggestion.reason}). Indique um motivo curto.`);
  }
  if (override !== "auto") return { invoice, suggestion };
  if (suggestion.requiresDecision) {
    throw new StockDecisionRequiredError("decision_required", `${suggestion.reason}: indique se este documento é enviado para o Stock.`);
  }
  if (suggestion.send === true) return { invoice: invoice.update({ stockReviewOverride: "force_create", stockReviewOverrideReason: null }), suggestion };
  if (suggestion.send === false) return { invoice: invoice.update({ stockReviewOverride: "force_skip", stockReviewOverrideReason: suggestion.reason }), suggestion };
  return { invoice, suggestion };
}
