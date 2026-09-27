import { InvalidBaseScheduleTemplateError } from "../errors.js";

/** 0 = Segunda .. 6 = Domingo — mesma convenção da grelha semanal do mockup (Seg..Dom). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface BaseScheduleTemplateProps {
  id: string;
  employeeId: string;
  weekday: Weekday;
  isDayOff: boolean;
  startTime: string | null;
  endTime: string | null;
  locationId: string | null;
  breakMinutes: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Uma célula do "modelo base" semanal de um colaborador (Escala base, RH-03)
 * — no máximo uma por (colaborador, dia da semana). "Aplicar esta escala à
 * semana" lê estas 7 células e materializa (ou atualiza) turnos reais em
 * `hr_work_shifts` para as datas da semana alvo — nunca sobre um turno
 * `source !== "base_schedule"` sem confirmação explícita (ver
 * `apply-base-schedule.use-case.ts`).
 */
export class BaseScheduleTemplate {
  readonly id: string;
  readonly employeeId: string;
  readonly weekday: Weekday;
  readonly isDayOff: boolean;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly locationId: string | null;
  readonly breakMinutes: number;
  readonly createdAt: string;
  readonly updatedAt: string;

  private constructor(props: BaseScheduleTemplateProps) {
    this.id = props.id;
    this.employeeId = props.employeeId;
    this.weekday = props.weekday;
    this.isDayOff = props.isDayOff;
    this.startTime = props.startTime;
    this.endTime = props.endTime;
    this.locationId = props.locationId;
    this.breakMinutes = props.breakMinutes;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static createDayOff(employeeId: string, weekday: Weekday): BaseScheduleTemplate {
    const now = new Date().toISOString();
    return new BaseScheduleTemplate({
      id: crypto.randomUUID(),
      employeeId,
      weekday,
      isDayOff: true,
      startTime: null,
      endTime: null,
      locationId: null,
      breakMinutes: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  static createWorkingDay(props: {
    employeeId: string;
    weekday: Weekday;
    startTime: string;
    endTime: string;
    locationId: string;
    breakMinutes?: number;
  }): BaseScheduleTemplate {
    if (props.startTime >= props.endTime) {
      throw new InvalidBaseScheduleTemplateError("A hora de início tem de ser antes da hora de fim");
    }
    const now = new Date().toISOString();
    return new BaseScheduleTemplate({
      id: crypto.randomUUID(),
      employeeId: props.employeeId,
      weekday: props.weekday,
      isDayOff: false,
      startTime: props.startTime,
      endTime: props.endTime,
      locationId: props.locationId,
      breakMinutes: props.breakMinutes ?? 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: BaseScheduleTemplateProps): BaseScheduleTemplate {
    return new BaseScheduleTemplate(props);
  }

  toProps(): BaseScheduleTemplateProps {
    return {
      id: this.id,
      employeeId: this.employeeId,
      weekday: this.weekday,
      isDayOff: this.isDayOff,
      startTime: this.startTime,
      endTime: this.endTime,
      locationId: this.locationId,
      breakMinutes: this.breakMinutes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
