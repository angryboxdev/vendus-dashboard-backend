import { InvalidShiftRotationError } from "../errors.js";

export interface ShiftPattern {
  startTime: string;
  endTime: string;
  /** 2º período (turno repartido) — null = turno direto (1 período). */
  secondStartTime: string | null;
  secondEndTime: string | null;
}

export interface ShiftRotationProps {
  id: string;
  /** Exactamente 2 no MVP (RH-03: "MVP: 2 colaboradores + Turno A / Turno B"). */
  participantEmployeeIds: [string, string];
  patternA: ShiftPattern;
  patternB: ShiftPattern;
  locationId: string;
  /** Segunda-feira da "semana 1" — participantEmployeeIds[0] começa no padrão A nessa semana. */
  anchorDate: string;
  autoSwitchWeekly: boolean;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function assertPattern(label: string, pattern: ShiftPattern): void {
  if (pattern.startTime >= pattern.endTime) {
    throw new InvalidShiftRotationError(`${label}: a hora de início tem de ser antes da hora de fim`);
  }
  if (pattern.secondStartTime != null) {
    if (pattern.secondEndTime == null) {
      throw new InvalidShiftRotationError(`${label}: falta a hora de fim do 2º período`);
    }
    if (pattern.secondStartTime >= pattern.secondEndTime) {
      throw new InvalidShiftRotationError(`${label}: no 2º período, a hora de início tem de ser antes da hora de fim`);
    }
    if (pattern.secondStartTime < pattern.endTime) {
      throw new InvalidShiftRotationError(`${label}: o 2º período não pode sobrepor o 1º`);
    }
  }
}

/**
 * Configuração de rotação semanal (RH-03) entre 2 colaboradores da mesma
 * função — alternam semanalmente entre "Turno A" e "Turno B". Não gera
 * turnos por si só: `apply-shift-rotation.use-case.ts` lê esta configuração
 * e materializa/atualiza `hr_work_shifts` (source="rotation") respeitando
 * férias/ausências/feriados e turnos já editados manualmente.
 */
export class ShiftRotation {
  readonly id: string;
  readonly participantEmployeeIds: [string, string];
  readonly patternA: ShiftPattern;
  readonly patternB: ShiftPattern;
  readonly locationId: string;
  readonly anchorDate: string;
  readonly autoSwitchWeekly: boolean;
  readonly active: boolean;
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;

  private constructor(props: ShiftRotationProps) {
    this.id = props.id;
    this.participantEmployeeIds = props.participantEmployeeIds;
    this.patternA = props.patternA;
    this.patternB = props.patternB;
    this.locationId = props.locationId;
    this.anchorDate = props.anchorDate;
    this.autoSwitchWeekly = props.autoSwitchWeekly;
    this.active = props.active;
    this.createdBy = props.createdBy;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    participantEmployeeIds: [string, string];
    patternA: { startTime: string; endTime: string; secondStartTime?: string | null; secondEndTime?: string | null };
    patternB: { startTime: string; endTime: string; secondStartTime?: string | null; secondEndTime?: string | null };
    locationId: string;
    anchorDate: string;
    autoSwitchWeekly?: boolean;
    createdBy?: string | null;
  }): ShiftRotation {
    if (props.participantEmployeeIds[0] === props.participantEmployeeIds[1]) {
      throw new InvalidShiftRotationError("Os 2 colaboradores da rotação têm de ser diferentes");
    }
    const patternA: ShiftPattern = {
      startTime: props.patternA.startTime,
      endTime: props.patternA.endTime,
      secondStartTime: props.patternA.secondStartTime ?? null,
      secondEndTime: props.patternA.secondEndTime ?? null,
    };
    const patternB: ShiftPattern = {
      startTime: props.patternB.startTime,
      endTime: props.patternB.endTime,
      secondStartTime: props.patternB.secondStartTime ?? null,
      secondEndTime: props.patternB.secondEndTime ?? null,
    };
    assertPattern("Turno A", patternA);
    assertPattern("Turno B", patternB);
    const now = new Date().toISOString();
    return new ShiftRotation({
      id: crypto.randomUUID(),
      participantEmployeeIds: props.participantEmployeeIds,
      patternA,
      patternB,
      locationId: props.locationId,
      anchorDate: props.anchorDate,
      autoSwitchWeekly: props.autoSwitchWeekly ?? true,
      active: true,
      createdBy: props.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: ShiftRotationProps): ShiftRotation {
    return new ShiftRotation(props);
  }

  setActive(active: boolean): ShiftRotation {
    return new ShiftRotation({ ...this.toProps(), active, updatedAt: new Date().toISOString() });
  }

  toProps(): ShiftRotationProps {
    return {
      id: this.id,
      participantEmployeeIds: this.participantEmployeeIds,
      patternA: this.patternA,
      patternB: this.patternB,
      locationId: this.locationId,
      anchorDate: this.anchorDate,
      autoSwitchWeekly: this.autoSwitchWeekly,
      active: this.active,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

/**
 * Quantas semanas completas separam `anchorDate` de `weekStartDate` (ambas
 * segundas-feiras). Semana par (0, 2, 4…) → participante[0] no padrão A;
 * semana ímpar → participante[1] no padrão A (alternam).
 */
export function weeksBetweenMondays(anchorDate: string, weekStartDate: string): number {
  const anchor = new Date(anchorDate + "T00:00:00Z").getTime();
  const target = new Date(weekStartDate + "T00:00:00Z").getTime();
  return Math.round((target - anchor) / (7 * 24 * 60 * 60 * 1000));
}

/** Participante (id) que fica no Turno A na semana que começa em `weekStartDate`. */
export function participantOnPatternA(rotation: ShiftRotation, weekStartDate: string): string {
  const weeks = weeksBetweenMondays(rotation.anchorDate, weekStartDate);
  const evenWeek = ((weeks % 2) + 2) % 2 === 0;
  return evenWeek ? rotation.participantEmployeeIds[0] : rotation.participantEmployeeIds[1];
}

/** Participante (id) que fica no Turno B na semana que começa em `weekStartDate`. */
export function participantOnPatternB(rotation: ShiftRotation, weekStartDate: string): string {
  const a = participantOnPatternA(rotation, weekStartDate);
  return rotation.participantEmployeeIds.find((id) => id !== a)!;
}
