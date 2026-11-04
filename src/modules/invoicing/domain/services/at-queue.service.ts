import type { AtOperation, AtQueueItem } from "../entities/at-communication.js";

/**
 * Regras da fila de comunicação ao e-Fatura. Puro.
 * Prazo: até ao dia 5 do mês seguinte ao da emissão (DL 198/2012, art. 3.º, n.º 2).
 */

/** Dia 5 do mês seguinte ao da data do documento (AAAA-MM-DD). */
export function communicationDeadline(documentDate: string): string {
  const [y, m] = documentDate.split("-").map(Number) as [number, number];
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return `${next.y}-${String(next.m).padStart(2, "0")}-05`;
}

/** Espera antes de nova tentativa depois de `failures` falhas: 5, 10, 20 … até 6 h. */
export function retryDelayMinutes(failures: number): number {
  return failures <= 0 ? 0 : Math.min(5 * 2 ** (failures - 1), 360);
}

/**
 * O que fazer agora com um documento da fila: registar (nunca aceite),
 * comunicar a mudança de estado (aceite noutro estado) ou esperar.
 * Dados recusados só se repetem com `force` (o utilizador corrigiu e pede de
 * novo). Credenciais recusadas só depois de regravadas — nem com `force`, para
 * não bloquear o subutilizador na AT com tentativas falhadas. Falhas esperam o intervalo.
 */
export function nextAtAction(item: AtQueueItem, now: Date, opts: { force?: boolean; credentialsUpdatedAt?: string | null } = {}): AtOperation | null {
  if (item.acceptedStatus === item.status) return null;
  if (item.lastOutcome === "auth") {
    const renewed = !!opts.credentialsUpdatedAt && !!item.lastAttemptAt && Date.parse(opts.credentialsUpdatedAt) > Date.parse(item.lastAttemptAt);
    if (!renewed) return null;
  } else if (!opts.force) {
    if (item.lastOutcome === "rejected") return null;
    if (item.lastOutcome === "failed" && item.lastAttemptAt) {
      const due = new Date(item.lastAttemptAt).getTime() + retryDelayMinutes(item.failures) * 60_000;
      if (now.getTime() < due) return null;
    }
  }
  return item.acceptedStatus === null ? "register" : "change-status";
}

export interface AtQueueSummary {
  pending: number;
  /** Recusados pela AT (dados ou credenciais): precisam de intervenção. */
  blocked: number;
  oldestPendingDate: string | null;
  /** Prazo do documento pendente mais antigo. */
  deadline: string | null;
  /** O prazo já passou. */
  overdue: boolean;
  /** Faltam 3 dias ou menos para o prazo. */
  dueSoon: boolean;
}

export function summarizeQueue(items: AtQueueItem[], today: string): AtQueueSummary {
  const oldest = items.reduce<string | null>((min, i) => (min === null || i.documentDate < min ? i.documentDate : min), null);
  const deadline = oldest ? communicationDeadline(oldest) : null;
  const daysLeft = deadline ? (Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000 : null;
  return {
    pending: items.length,
    blocked: items.filter((i) => i.lastOutcome === "rejected" || i.lastOutcome === "auth").length,
    oldestPendingDate: oldest,
    deadline,
    overdue: daysLeft !== null && daysLeft < 0,
    dueSoon: daysLeft !== null && daysLeft >= 0 && daysLeft <= 3,
  };
}
