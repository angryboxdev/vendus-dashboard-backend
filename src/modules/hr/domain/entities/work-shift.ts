import { InvalidWorkShiftError } from "../errors.js";

export type ShiftStatus = "draft" | "published";
/** `template`/`automation`: gerado por um Modelo de turno aplicado / por uma Automatização (RH 2.0). */
export type ShiftSource = "manual" | "base_schedule" | "rotation" | "template" | "automation";
export type ShiftKind = "direct" | "split";

export interface WorkShiftSegment {
  startTime: string;
  endTime: string;
}

export interface WorkShiftProps {
  id: string;
  employeeId: string;
  /** YYYY-MM-DD — dia civil em que o turno começa. */
  workDate: string;
  /** HH:mm — início do 1º (e único, se turno direto) período. */
  startTime: string;
  /** HH:mm — fim do 1º período. Se `endsNextDay`, refere-se ao dia seguinte a `workDate`. */
  endTime: string;
  /** Turno noturno (atravessa a meia-noite) — nunca dividido em duas linhas (task "Novo Turno Padrão Semanal", secção 4). */
  endsNextDay: boolean;
  /** 2º período de um turno repartido (secção 3) — null = turno direto. Nunca combinado com `endsNextDay` nesta V1. */
  secondStartTime: string | null;
  secondEndTime: string | null;
  locationId: string;
  breakMinutes: number;
  notes: string | null;
  status: ShiftStatus;
  source: ShiftSource;
  rotationId: string | null;
  /** Tag partilhada por todos os turnos da mesma série recorrente (sem tabela pai) — null = avulso, ou já destacado por edição individual. */
  seriesId: string | null;
  /** Modelo de turno de origem (RH 2.0) — só referência; o horário/local acima são cópia (snapshot). */
  templateId: string | null;
  /** Automatização que gerou o turno (RH 2.0) — só referência. */
  automationId: string | null;
  createdAt: string;
  updatedAt: string;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Valida a forma completa de horários de um turno (direto/repartido/noturno)
 * — mesma regra usada em create/edição manual/reaplicação de template e nos
 * Modelos de turno (RH 2.0). Lança `InvalidWorkShiftError`.
 */
export function assertShiftShape(props: {
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  secondStartTime: string | null;
  secondEndTime: string | null;
}): void {
  const { startTime, endTime, endsNextDay, secondStartTime, secondEndTime } = props;

  if (endsNextDay && secondStartTime != null) {
    throw new InvalidWorkShiftError("Turno repartido não é suportado em turnos que terminam no dia seguinte");
  }
  if (!endsNextDay && startTime >= endTime) {
    throw new InvalidWorkShiftError("A hora de início tem de ser antes da hora de fim (mesmo dia civil)");
  }
  if (secondStartTime != null) {
    if (secondEndTime == null) {
      throw new InvalidWorkShiftError("Falta a hora de fim do 2º período");
    }
    if (secondStartTime >= secondEndTime) {
      throw new InvalidWorkShiftError("No 2º período, a hora de início tem de ser antes da hora de fim");
    }
    if (secondStartTime < endTime) {
      throw new InvalidWorkShiftError("O 2º período não pode sobrepor o 1º");
    }
  }
}

/**
 * Um turno planeado (não confere presença real — isso é `hr_shift_attendance`,
 * lido via `ShiftAttendanceReadPort`). `source` regista a proveniência: um
 * turno `manual` está protegido contra reaplicação silenciosa de escala base
 * ou rotação (RH-03: "aplicar escala base... não deve sobrescrever exceções
 * existentes sem confirmação"). Qualquer edição interativa de um turno antes
 * gerado por escala base/rotação marca-o `manual` a partir desse momento — o
 * mesmo mecanismo protege um turno destacado de uma série ("Somente este
 * turno" limpa `seriesId`, ver task "Novo Turno Padrão Semanal" secção 10).
 */
export class WorkShift {
  readonly id: string;
  readonly employeeId: string;
  readonly workDate: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly endsNextDay: boolean;
  readonly secondStartTime: string | null;
  readonly secondEndTime: string | null;
  readonly locationId: string;
  readonly breakMinutes: number;
  readonly notes: string | null;
  readonly status: ShiftStatus;
  readonly source: ShiftSource;
  readonly rotationId: string | null;
  readonly seriesId: string | null;
  readonly templateId: string | null;
  readonly automationId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;

  private constructor(props: WorkShiftProps) {
    this.id = props.id;
    this.employeeId = props.employeeId;
    this.workDate = props.workDate;
    this.startTime = props.startTime;
    this.endTime = props.endTime;
    this.endsNextDay = props.endsNextDay;
    this.secondStartTime = props.secondStartTime;
    this.secondEndTime = props.secondEndTime;
    this.locationId = props.locationId;
    this.breakMinutes = props.breakMinutes;
    this.notes = props.notes;
    this.status = props.status;
    this.source = props.source;
    this.rotationId = props.rotationId;
    this.seriesId = props.seriesId;
    this.templateId = props.templateId;
    this.automationId = props.automationId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get kind(): ShiftKind {
    return this.secondStartTime != null ? "split" : "direct";
  }

  get segments(): WorkShiftSegment[] {
    const segments: WorkShiftSegment[] = [{ startTime: this.startTime, endTime: this.endTime }];
    if (this.secondStartTime != null && this.secondEndTime != null) {
      segments.push({ startTime: this.secondStartTime, endTime: this.secondEndTime });
    }
    return segments;
  }

  /** Duração total trabalhada, em minutos — soma os 2 períodos quando repartido; conta a virada de dia quando noturno. */
  durationMinutes(): number {
    const firstMinutes = this.endsNextDay
      ? 24 * 60 - toMinutes(this.startTime) + toMinutes(this.endTime)
      : toMinutes(this.endTime) - toMinutes(this.startTime);
    const secondMinutes =
      this.secondStartTime != null && this.secondEndTime != null
        ? toMinutes(this.secondEndTime) - toMinutes(this.secondStartTime)
        : 0;
    return firstMinutes + secondMinutes;
  }

  static create(props: {
    employeeId: string;
    workDate: string;
    startTime: string;
    endTime: string;
    endsNextDay?: boolean;
    secondStartTime?: string | null;
    secondEndTime?: string | null;
    locationId: string;
    breakMinutes?: number;
    notes?: string | null;
    status?: ShiftStatus;
    source?: ShiftSource;
    rotationId?: string | null;
    seriesId?: string | null;
    templateId?: string | null;
    automationId?: string | null;
  }): WorkShift {
    const endsNextDay = props.endsNextDay ?? false;
    const secondStartTime = props.secondStartTime ?? null;
    const secondEndTime = props.secondEndTime ?? null;
    assertShiftShape({ startTime: props.startTime, endTime: props.endTime, endsNextDay, secondStartTime, secondEndTime });
    const now = new Date().toISOString();
    return new WorkShift({
      id: crypto.randomUUID(),
      employeeId: props.employeeId,
      workDate: props.workDate,
      startTime: props.startTime,
      endTime: props.endTime,
      endsNextDay,
      secondStartTime,
      secondEndTime,
      locationId: props.locationId,
      breakMinutes: props.breakMinutes ?? 0,
      notes: props.notes ?? null,
      status: props.status ?? "draft",
      source: props.source ?? "manual",
      rotationId: props.rotationId ?? null,
      seriesId: props.seriesId ?? null,
      templateId: props.templateId ?? null,
      automationId: props.automationId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: WorkShiftProps): WorkShift {
    return new WorkShift(props);
  }

  /**
   * Edição interativa (drawer) — passa sempre a `source: "manual"` e limpa
   * `seriesId`, protegendo o turno de reaplicações futuras de escala
   * base/rotação e de edições em lote de "toda a série"/"este e os
   * seguintes" (secção 10 da task).
   */
  applyManualEdit(patch: {
    workDate?: string;
    startTime?: string;
    endTime?: string;
    endsNextDay?: boolean;
    secondStartTime?: string | null;
    secondEndTime?: string | null;
    locationId?: string;
    breakMinutes?: number;
    notes?: string | null;
  }): WorkShift {
    const startTime = patch.startTime ?? this.startTime;
    const endTime = patch.endTime ?? this.endTime;
    const endsNextDay = patch.endsNextDay ?? this.endsNextDay;
    const secondStartTime = patch.secondStartTime !== undefined ? patch.secondStartTime : this.secondStartTime;
    const secondEndTime = patch.secondEndTime !== undefined ? patch.secondEndTime : this.secondEndTime;
    assertShiftShape({ startTime, endTime, endsNextDay, secondStartTime, secondEndTime });
    return new WorkShift({
      ...this.toProps(),
      ...patch,
      startTime,
      endTime,
      endsNextDay,
      secondStartTime,
      secondEndTime,
      source: "manual",
      seriesId: null,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Substituição de valores por uma reaplicação de escala base/rotação (só
   * chamada quando o turno NÃO é `manual`). `endsNextDay`/`secondStartTime`/
   * `secondEndTime` são opcionais e ficam `false`/`null` quando omitidos —
   * a escala base continua sem os passar (não suporta repartido/noturno
   * nesta versão); as rotações passam-nos desde que ganharam suporte a
   * turno repartido no Padrão A/B.
   */
  overwriteFromTemplate(patch: {
    startTime: string;
    endTime: string;
    endsNextDay?: boolean;
    secondStartTime?: string | null;
    secondEndTime?: string | null;
    locationId: string;
    breakMinutes: number;
    source: Extract<ShiftSource, "base_schedule" | "rotation">;
    rotationId?: string | null;
  }): WorkShift {
    const endsNextDay = patch.endsNextDay ?? false;
    const secondStartTime = patch.secondStartTime ?? null;
    const secondEndTime = patch.secondEndTime ?? null;
    assertShiftShape({ startTime: patch.startTime, endTime: patch.endTime, endsNextDay, secondStartTime, secondEndTime });
    return new WorkShift({
      ...this.toProps(),
      startTime: patch.startTime,
      endTime: patch.endTime,
      endsNextDay,
      secondStartTime,
      secondEndTime,
      locationId: patch.locationId,
      breakMinutes: patch.breakMinutes,
      source: patch.source,
      rotationId: patch.rotationId ?? this.rotationId,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Aplicação de uma alteração vinda de uma edição em lote de série
   * ("Este e os seguintes"/"Toda a série") — ao contrário de
   * `applyManualEdit`, preserva `seriesId` e não altera `source` (o turno
   * continua a pertencer à série).
   */
  applySeriesEdit(patch: {
    startTime?: string;
    endTime?: string;
    endsNextDay?: boolean;
    secondStartTime?: string | null;
    secondEndTime?: string | null;
    locationId?: string;
    notes?: string | null;
  }): WorkShift {
    const startTime = patch.startTime ?? this.startTime;
    const endTime = patch.endTime ?? this.endTime;
    const endsNextDay = patch.endsNextDay ?? this.endsNextDay;
    const secondStartTime = patch.secondStartTime !== undefined ? patch.secondStartTime : this.secondStartTime;
    const secondEndTime = patch.secondEndTime !== undefined ? patch.secondEndTime : this.secondEndTime;
    assertShiftShape({ startTime, endTime, endsNextDay, secondStartTime, secondEndTime });
    return new WorkShift({
      ...this.toProps(),
      ...patch,
      startTime,
      endTime,
      endsNextDay,
      secondStartTime,
      secondEndTime,
      updatedAt: new Date().toISOString(),
    });
  }

  publish(): WorkShift {
    return new WorkShift({ ...this.toProps(), status: "published", updatedAt: new Date().toISOString() });
  }

  toProps(): WorkShiftProps {
    return {
      id: this.id,
      employeeId: this.employeeId,
      workDate: this.workDate,
      startTime: this.startTime,
      endTime: this.endTime,
      endsNextDay: this.endsNextDay,
      secondStartTime: this.secondStartTime,
      secondEndTime: this.secondEndTime,
      locationId: this.locationId,
      breakMinutes: this.breakMinutes,
      notes: this.notes,
      status: this.status,
      source: this.source,
      rotationId: this.rotationId,
      seriesId: this.seriesId,
      templateId: this.templateId,
      automationId: this.automationId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
