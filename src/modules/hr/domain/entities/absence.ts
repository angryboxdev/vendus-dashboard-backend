import type { LeaveType } from "../ports/out/leave-read.port.js";

/**
 * Ausência (Férias & Ausências 2.0, RH 2.0 T4) — `hr_leave_requests`. Nunca
 * apagada: cancelar muda o estado (fica no histórico). Pode ser de dias
 * inteiros, meio dia ou horas (as duas últimas num só dia). Férias só em dias
 * inteiros — o saldo conta dias.
 */
export type AbsenceStatus = "active" | "cancelled";
export type AbsenceDuration = "day" | "half_day" | "hours";

export const ABSENCE_TYPES: LeaveType[] = ["vacation", "sick_leave", "justified", "unjustified", "compensatory", "authorized_absence", "license", "other"];

/** Meio dia, em minutos (sem horas definidas). */
export const HALF_DAY_MINUTES = 4 * 60;

export interface AbsenceProps {
  id: string;
  employeeId: string;
  type: LeaveType;
  status: AbsenceStatus;
  startDate: string;
  endDate: string;
  /** Parcial por horas: ambas preenchidas. */
  startTime: string | null;
  endTime: string | null;
  /** Parcial (meio dia/horas): minutos; dias inteiros: null. */
  minutes: number | null;
  workingDays: number;
  notes: string | null;
  source: "hr" | "portal";
  portalRequestId: string | null;
  createdBy: string | null;
  createdAt: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
}

export class InvalidAbsenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAbsenceError";
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^\d{2}:\d{2}$/;
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

export class Absence {
  private constructor(private readonly props: AbsenceProps) {}

  static reconstitute(props: AbsenceProps): Absence {
    return new Absence({ ...props });
  }

  static register(p: {
    employeeId: string;
    type: LeaveType;
    duration: AbsenceDuration;
    startDate: string;
    endDate: string;
    startTime?: string | null;
    endTime?: string | null;
    notes?: string | null;
    workingDays: number;
    createdBy: string;
  }): Absence {
    if (!ABSENCE_TYPES.includes(p.type)) throw new InvalidAbsenceError("Tipo de ausência inválido.");
    if (!ISO.test(p.startDate) || !ISO.test(p.endDate) || p.endDate < p.startDate) throw new InvalidAbsenceError("Período inválido.");
    let startTime: string | null = null;
    let endTime: string | null = null;
    let minutes: number | null = null;
    if (p.duration !== "day") {
      if (p.type === "vacation") throw new InvalidAbsenceError("Férias registam-se em dias inteiros.");
      if (p.startDate !== p.endDate) throw new InvalidAbsenceError("Meio dia ou horas é sempre num só dia.");
      if (p.duration === "hours") {
        if (!p.startTime || !p.endTime || !HM.test(p.startTime) || !HM.test(p.endTime) || p.endTime <= p.startTime) {
          throw new InvalidAbsenceError("Indique a hora de início e de fim (fim depois do início).");
        }
        startTime = p.startTime;
        endTime = p.endTime;
        minutes = toMin(p.endTime) - toMin(p.startTime);
      } else {
        minutes = HALF_DAY_MINUTES;
      }
    }
    const notes = p.notes?.trim() || null;
    if (notes && notes.length > 500) throw new InvalidAbsenceError("A observação tem no máximo 500 caracteres.");
    return new Absence({
      id: crypto.randomUUID(),
      employeeId: p.employeeId,
      type: p.type,
      status: "active",
      startDate: p.startDate,
      endDate: p.endDate,
      startTime,
      endTime,
      minutes,
      workingDays: p.duration === "day" ? p.workingDays : 0,
      notes,
      source: "hr",
      portalRequestId: null,
      createdBy: p.createdBy,
      createdAt: new Date().toISOString(),
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
    });
  }

  get id() { return this.props.id; }
  get employeeId() { return this.props.employeeId; }
  get type() { return this.props.type; }
  get status() { return this.props.status; }
  get startDate() { return this.props.startDate; }
  get endDate() { return this.props.endDate; }
  get isActive() { return this.props.status === "active"; }

  overlaps(startDate: string, endDate: string): boolean {
    return this.props.startDate <= endDate && startDate <= this.props.endDate;
  }

  cancel(by: string, reason: string, at: Date = new Date()): Absence {
    if (this.props.status !== "active") throw new InvalidAbsenceError("Esta ausência já está cancelada.");
    if (!reason.trim()) throw new InvalidAbsenceError("Indique o motivo do cancelamento.");
    return new Absence({ ...this.props, status: "cancelled", cancelledAt: at.toISOString(), cancelledBy: by, cancelReason: reason.trim() });
  }

  toProps(): AbsenceProps {
    return { ...this.props };
  }
}
