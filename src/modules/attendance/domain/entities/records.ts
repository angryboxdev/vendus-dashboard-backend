import type { RevisionOperation, SegmentType } from "./clock.js";
import type { IncidentType } from "../services/day-engine.js";

/** Pedido de correção do colaborador (Eng. Reversa 3.5): aprovado por outra pessoa vira revisão. */
export interface CorrectionRequest {
  id: string;
  employeeId: string;
  requestedBy: string;
  operation: RevisionOperation;
  targetEventId: string | null;
  occurredAt: string | null;
  segmentType: SegmentType | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  decidedBy: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  revisionId: string | null;
  createdAt: string;
  /** FE-113: níveis do fluxo "Correções de ponto" fixados na criação ([] = sem fluxo: decide quem gere a assiduidade). */
  levels: { approvers: string[]; escalated: boolean }[];
  currentLevel: number;
}

export type IncidentStatus = "open" | "resolved_correct" | "resolved_validate" | "dismissed";

export interface Incident {
  id: string;
  employeeId: string;
  workDate: string;
  type: IncidentType;
  source: string;
  status: IncidentStatus;
  comment: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

/** Versão de um dia apurado (TK-13): nunca se altera — um recálculo cria a seguinte. */
export interface DayVersion {
  employeeId: string;
  workDate: string;
  version: number;
  workedSeconds: number;
  breakSeconds: number;
  nightSeconds: number;
  theoreticalSeconds: number;
  excessSeconds: number;
  pendingSeconds: number;
  configHash: string;
  calculatedAt: string;
}

export interface Adjustment {
  id: string;
  employeeId: string;
  workDate: string;
  fromVersion: number;
  toVersion: number;
  deltaExcessSeconds: number;
  reason: string;
  createdAt: string;
}
