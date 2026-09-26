export type AlertSeverity = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";

export interface OverviewAlert {
  alertType: string;
  entityId: string;
  severity: AlertSeverity;
  /** ISO datetime — usado para "antiguidade" e "data/hora" (mesmo critério, ver nota abaixo). */
  occurredAt: string;
  employeeId: string;
  employeeName: string;
  message: string;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };

/**
 * Ordena por severidade, depois antiguidade (mais antigo primeiro), depois
 * ID como desempate final — RH-01 secção 9. "Antiguidade" e "data/hora" são
 * o mesmo critério aqui (só existe um timestamp por alerta,
 * `occurredAt`) — simplificação documentada, não dois critérios
 * independentes. Deduplica por `alertType + entityId` antes de ordenar. O
 * limite de 5 é responsabilidade do use-case, não deste serviço (para
 * manter a lista completa testável).
 */
export function prioritizeAndDedupAlerts(alerts: OverviewAlert[]): OverviewAlert[] {
  const seen = new Set<string>();
  const deduped = alerts.filter((a) => {
    const key = `${a.alertType}:${a.entityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.sort((a, b) => {
    const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDiff !== 0) return severityDiff;
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
    return a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0;
  });
}
