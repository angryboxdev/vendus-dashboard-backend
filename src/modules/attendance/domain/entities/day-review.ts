/**
 * Decisão de conferência de um dia (Assiduidade V2, ADR-0043). Separa os
 * quatro conceitos: a picagem original (clock_events, intocada), o planeado
 * (escala publicada), a decisão (quem confirmou o quê, abrangência, motivo) e o
 * tempo validado que o motor passa a usar nesse dia.
 */
export const REVIEW_DECISIONS = ["fulfilled", "keep", "manual", "absence"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const REVIEW_SCOPES = ["day", "selected", "week"] as const;
export type ReviewScope = (typeof REVIEW_SCOPES)[number];

/** Faixa "HH:MM"–"HH:MM" (fim ≤ início = passa a meia-noite). */
export interface PlannedRange {
  start: string;
  end: string;
}

export interface ManualTimes {
  start: string;
  end: string;
  breakMinutes: number;
}

export interface DayReview {
  id: string;
  employeeId: string;
  workDate: string;
  decision: ReviewDecision;
  /** null = mantém os segundos calculados a partir das picagens ("manter", "ausência"). */
  validatedSeconds: number | null;
  /** Fotografia do momento da decisão. */
  beforeSeconds: number;
  theoreticalSeconds: number;
  plannedRanges: PlannedRange[] | null;
  manual: ManualTimes | null;
  absenceType: string | null;
  reason: string;
  scope: ReviewScope;
  batchId: string | null;
  dayVersion: number | null;
  createdBy: string;
  createdAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
}

export type NewDayReview = Omit<DayReview, "id" | "createdAt" | "voidedAt" | "voidedBy" | "voidReason">;
