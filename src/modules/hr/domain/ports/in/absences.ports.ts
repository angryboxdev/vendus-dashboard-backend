import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AbsenceDuration } from "../../entities/absence.js";
import type { LeaveType } from "../out/leave-read.port.js";

/** Linha de "Registos" / barra do Calendário — ausência registada ou pedido do Portal ainda não aprovado. */
export interface AbsenceRecordDTO {
  id: string;
  /** "absence" = registo em Férias & Ausências; "request" = pedido do Portal (pendente/rejeitado/cancelado). */
  source: "absence" | "request";
  employeeId: string;
  employeeName: string;
  positionName: string | null;
  locationId: string | null;
  locationName: string | null;
  type: LeaveType;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  duration: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  /** Turnos publicados do colaborador no período (ficam — o gerente resolve). */
  affectedShifts: number;
  notes: string | null;
  origin: "hr" | "portal";
  /** Motivo do cancelamento / da decisão. */
  decisionNote: string | null;
}

export interface AbsenceBoardDTO {
  records: AbsenceRecordDTO[];
  attention: { pendingRequests: number; pendingDocuments: number; shiftConflicts: number };
}

export interface GetAbsenceBoardPort {
  execute(command: { organizationId: OrganizationId; from: string; to: string }): Promise<AbsenceBoardDTO>;
}

export interface RegisterAbsenceCommand {
  organizationId: OrganizationId;
  actor: string;
  employeeId: string;
  type: LeaveType;
  duration: AbsenceDuration;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
}

export interface AbsenceImpactDTO {
  workingDays: number;
  duration: string;
  /** Só para férias. `defined: false` = o RH ainda não definiu o saldo do ano. */
  balance: { defined: boolean; available: number | null; after: number | null } | null;
  affectedShifts: Array<{ workDate: string; hours: string }>;
  othersAbsent: string[];
  overlapsExisting: boolean;
}

export interface PreviewAbsencePort {
  execute(command: RegisterAbsenceCommand): Promise<AbsenceImpactDTO>;
}
export interface RegisterAbsencePort {
  execute(command: RegisterAbsenceCommand): Promise<{ id: string }>;
}
export interface CancelAbsencePort {
  execute(command: { organizationId: OrganizationId; actor: string; id: string; reason: string }): Promise<void>;
}
