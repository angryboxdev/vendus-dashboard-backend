/**
 * Marcações e revisões (Eng. Reversa 3.1–3.5, 13.1 `clock_event`,
 * `clock_event_revision`). Marcações são **append-only**: uma correção nunca
 * altera a original — cria uma revisão (acrescentar, mudar ou anular) com
 * valores antes/depois, motivo e autor.
 *
 * Cada marcação muda o estado a partir desse instante: trabalho, remoto,
 * pausa paga/não paga, ou saída (`off`).
 */

export type SegmentType = "work" | "remote" | "break_paid" | "break_unpaid" | "off";
export const SEGMENT_TYPES: SegmentType[] = ["work", "remote", "break_paid", "break_unpaid", "off"];
export type ClockSource = "web" | "pwa" | "kiosk" | "admin" | "correction";

export interface ClockEvent {
  id: string;
  employeeId: string;
  occurredAt: string;
  segmentType: SegmentType;
  source: ClockSource;
  clientEventId: string | null;
  locationId: string | null;
  latitude: number | null;
  longitude: number | null;
  ip: string | null;
  /** FE-103: tipo de pausa do catálogo (só em marcações de pausa; null = pausa sem tipo, como antes). */
  breakTypeId?: string | null;
  /** FE-105: tipo de registo do catálogo (só em marcações de trabalho; null = registo normal). */
  clockTypeId?: string | null;
}

export type RevisionOperation = "add" | "update" | "void";

export interface ClockRevision {
  id: string;
  employeeId: string;
  operation: RevisionOperation;
  targetEventId: string | null;
  occurredAt: string | null;
  segmentType: SegmentType | null;
  reason: string;
  author: string;
  state: "active" | "refused";
  /** RE-11: até quando o colaborador pode recusar (null = não pode). */
  refusableUntil: string | null;
  /** Instante a que diz respeito (nova hora, ou a hora da marcação alvo) — leitura por período. */
  anchorAt: string;
  createdAt: string;
}

export interface EffectiveEvent {
  /** Id da marcação original ou `rev:<id>` quando acrescentada por revisão. */
  id: string;
  occurredAt: string;
  segmentType: SegmentType;
  revised: boolean;
  breakTypeId?: string | null;
  clockTypeId?: string | null;
}

/**
 * Marcações em vigor = originais − anuladas/mudadas por revisões ativas +
 * acrescentadas por revisões ativas. A revisão mais recente sobre a mesma
 * marcação prevalece. Revisões recusadas pelo colaborador não contam.
 */
export function effectiveEvents(events: ClockEvent[], revisions: ClockRevision[]): EffectiveEvent[] {
  const active = revisions.filter((r) => r.state === "active").sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const byId = new Map<string, EffectiveEvent>(events.map((e) => [e.id, { id: e.id, occurredAt: e.occurredAt, segmentType: e.segmentType, revised: false, breakTypeId: e.breakTypeId ?? null, clockTypeId: e.clockTypeId ?? null }]));
  for (const r of active) {
    if (r.operation === "add" && r.occurredAt && r.segmentType) {
      byId.set(`rev:${r.id}`, { id: `rev:${r.id}`, occurredAt: r.occurredAt, segmentType: r.segmentType, revised: true });
    } else if (r.operation === "void" && r.targetEventId) {
      byId.delete(r.targetEventId);
    } else if (r.operation === "update" && r.targetEventId && byId.has(r.targetEventId)) {
      const cur = byId.get(r.targetEventId)!;
      // Mudar o tipo de marcação tira o tipo de pausa (deixa de ser a mesma pausa).
      const segmentType = r.segmentType ?? cur.segmentType;
      byId.set(r.targetEventId, { ...cur, occurredAt: r.occurredAt ?? cur.occurredAt, segmentType, revised: true, breakTypeId: segmentType === cur.segmentType ? (cur.breakTypeId ?? null) : null, clockTypeId: segmentType === cur.segmentType ? (cur.clockTypeId ?? null) : null });
    }
  }
  return [...byId.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
}
