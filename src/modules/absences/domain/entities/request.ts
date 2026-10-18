import type { LevelSnapshot } from "./approval-flow.js";

export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface AbsenceRequest {
  id: string;
  employeeId: string;
  typeId: string;
  kind: "absence" | "holiday_compensation";
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  halfDay: boolean;
  amount: number;
  unit: "days" | "hours";
  /** Início do período do saldo (AAAA-MM-DD). */
  period: string;
  status: RequestStatus;
  comment: string | null;
  attachmentDocumentId: string | null;
  /** Anexo carregado pelo próprio (Portal): ficheiro privado em `hr-documents`. */
  attachment: { path: string; name: string; mime: string } | null;
  requestedBy: string;
  requestedByUserId: string | null;
  levels: LevelSnapshot[];
  currentLevel: number;
  decidedAt: string | null;
  cancelReason: string | null;
  createdAt: string;
}

export interface ApprovalDecision {
  id: string;
  requestId: string;
  level: number;
  actor: string;
  actorUserId: string | null;
  decision: "approve" | "reject" | "escalated" | "cancel";
  comment: string | null;
  createdAt: string;
}

export type LedgerKind = "accrual" | "request" | "reversal" | "adjustment" | "expiry" | "carryover" | "holiday_compensation";

/** Movimento de saldo (append-only — RE-25). Positivo soma, negativo consome. */
export interface LedgerEntry {
  id: string;
  employeeId: string;
  typeId: string;
  period: string;
  kind: LedgerKind;
  amount: number;
  unit: "days" | "hours";
  requestId: string | null;
  referenceDate: string | null;
  reason: string;
  createdBy: string;
  createdAt: string;
}

/** Duas ausências sobrepõem-se? Por horas no mesmo dia, só se as horas se cruzarem. */
export function overlaps(a: Pick<AbsenceRequest, "startDate" | "endDate" | "startTime" | "endTime">, b: Pick<AbsenceRequest, "startDate" | "endDate" | "startTime" | "endTime">): boolean {
  if (a.endDate < b.startDate || b.endDate < a.startDate) return false;
  if (a.startTime && b.startTime && a.startDate === a.endDate && b.startDate === b.endDate) return a.startTime < b.endTime! && b.startTime < a.endTime!;
  return true;
}
