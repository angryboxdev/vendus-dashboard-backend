import type { PlanningAlert } from "../../domain/entities/planning-alert.js";
import type { PlanningAlertRowDTO } from "../../domain/ports/in/stock-planning.ports.js";

export function toAlertRowDTO(alert: PlanningAlert, itemName: string): PlanningAlertRowDTO {
  const p = alert.toProps();
  return {
    id: p.id,
    itemId: p.itemId,
    itemName,
    alertType: p.alertType,
    severity: p.severity,
    state: p.state,
    firstDetectedAt: p.firstDetectedAt.toISOString(),
    lastUpdatedAt: p.lastUpdatedAt.toISOString(),
    resolvedAt: p.resolvedAt ? p.resolvedAt.toISOString() : null,
  };
}

/** Frases curtas e explicáveis (secção 88 — nunca falsa precisão) por tipo de alerta. */
export function explainAlert(alert: PlanningAlert): string {
  const ctx = alert.toProps().contextSnapshot;
  switch (alert.alertType) {
    case "stockout_risk":
      return ctx.ruptureDate
        ? `Rutura prevista para ${String(ctx.ruptureDate)}, com base no consumo previsto.`
        : "Risco de rutura detetado com base no consumo previsto.";
    case "excess_stock":
      return "Sem consumo previsto no horizonte atual — stock parado, considera rever a quantidade.";
    case "price_anomaly": {
      const deviation = ctx.deviationPercent != null ? `${Math.round(Number(ctx.deviationPercent) * 100)}%` : "significativamente";
      return `Última compra ${deviation} acima do custo de referência.`;
    }
    case "data_quality_warning":
      return "Stock teórico negativo ou inconsistente — confirma com uma contagem física antes de confiar na projeção.";
    default:
      return "Condição detetada pelo planeamento de stock.";
  }
}
