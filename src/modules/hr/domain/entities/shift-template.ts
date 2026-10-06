import { InvalidShiftTemplateError, InvalidWorkShiftError } from "../errors.js";
import { assertShiftShape, type ShiftKind, type WorkShiftSegment } from "./work-shift.js";

/**
 * Grupo do modelo (Modelos de Turno 2.0) — SÓ organização/filtro da
 * biblioteca; não altera horário, geração, conflitos nem automatizações.
 * Independente do Tipo (Direto/Repartido).
 */
export type ShiftTemplateGroup = "OPENING" | "INTERMEDIATE" | "CLOSING" | "FULL_TIME" | "OTHER";
export const SHIFT_TEMPLATE_GROUPS: readonly ShiftTemplateGroup[] = ["OPENING", "INTERMEDIATE", "CLOSING", "FULL_TIME", "OTHER"];

export interface ShiftTemplateDetails {
  name: string;
  /** Omitido = "OTHER". */
  group?: ShiftTemplateGroup;
  description: string | null;
  /** Cor do ponto na lista/escala (ex.: "#3B82F6"); null = cor por omissão. */
  color: string | null;
  startTime: string;
  endTime: string;
  /** Turno noturno (ex.: 16:00–00:00, 22:00–06:00) — termina no dia seguinte. */
  endsNextDay: boolean;
  /** 2º período do turno repartido; null = direto. */
  secondStartTime: string | null;
  secondEndTime: string | null;
  breakMinutes: number;
  /** Local padrão opcional — 2.º na precedência do Local (task RH 2.0 §4). */
  locationId: string | null;
}

export interface ShiftTemplateProps extends ShiftTemplateDetails {
  group: ShiftTemplateGroup;
  id: string;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const MAX_NAME_LENGTH = 80;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

/** Mesma normalização da coluna gerada `hr_shift_templates.normalized_name`. */
export function normalizeShiftTemplateName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function clean(details: ShiftTemplateDetails): ShiftTemplateDetails & { group: ShiftTemplateGroup } {
  const group = details.group ?? "OTHER";
  if (!SHIFT_TEMPLATE_GROUPS.includes(group)) throw new InvalidShiftTemplateError("Grupo do modelo inválido");
  const name = details.name.trim().replace(/\s+/g, " ");
  if (name.length === 0) throw new InvalidShiftTemplateError("Nome do modelo é obrigatório");
  if (name.length > MAX_NAME_LENGTH) throw new InvalidShiftTemplateError(`Nome do modelo: máximo ${MAX_NAME_LENGTH} caracteres`);
  for (const t of [details.startTime, details.endTime, details.secondStartTime, details.secondEndTime]) {
    if (t !== null && !TIME.test(t)) throw new InvalidShiftTemplateError("Horas no formato HH:mm");
  }
  if (details.color !== null && !COLOR.test(details.color)) throw new InvalidShiftTemplateError("Cor inválida");
  if (!Number.isInteger(details.breakMinutes) || details.breakMinutes < 0) {
    throw new InvalidShiftTemplateError("Pausa inválida");
  }
  try {
    assertShiftShape(details);
  } catch (e) {
    if (e instanceof InvalidWorkShiftError) throw new InvalidShiftTemplateError(e.message);
    throw e;
  }
  return { ...details, group, name, description: details.description?.trim() || null };
}

/**
 * Modelo de turno (RH 2.0 §3) — horário reutilizável aplicado manualmente
 * ou por Automatizações. Os turnos gerados copiam o horário/local
 * (snapshot) e só guardam a referência ao modelo: alterar ou inativar um
 * modelo afeta apenas utilizações futuras (§1, teste crítico 1). Nunca é
 * apagado, só inativado.
 */
export class ShiftTemplate {
  private constructor(private readonly props: ShiftTemplateProps) {}

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get active(): boolean {
    return this.props.active;
  }
  get locationId(): string | null {
    return this.props.locationId;
  }
  get group(): ShiftTemplateGroup {
    return this.props.group;
  }
  get normalizedName(): string {
    return normalizeShiftTemplateName(this.props.name);
  }
  get kind(): ShiftKind {
    return this.props.secondStartTime !== null ? "split" : "direct";
  }
  get segments(): WorkShiftSegment[] {
    const segments: WorkShiftSegment[] = [{ startTime: this.props.startTime, endTime: this.props.endTime }];
    if (this.props.secondStartTime !== null && this.props.secondEndTime !== null) {
      segments.push({ startTime: this.props.secondStartTime, endTime: this.props.secondEndTime });
    }
    return segments;
  }

  /** Tempo de trabalho em minutos (soma dos períodos, atravessa a meia-noite se noturno, menos a pausa). */
  workMinutes(): number {
    const p = this.props;
    const first = p.endsNextDay ? 24 * 60 - toMinutes(p.startTime) + toMinutes(p.endTime) : toMinutes(p.endTime) - toMinutes(p.startTime);
    const second = p.secondStartTime !== null && p.secondEndTime !== null ? toMinutes(p.secondEndTime) - toMinutes(p.secondStartTime) : 0;
    return Math.max(0, first + second - p.breakMinutes);
  }

  /** Tempo do início do 1.º período ao fim do último (ex.: repartido 12:00–23:00 = 11h, com 7h de trabalho). */
  spanMinutes(): number {
    const p = this.props;
    const end = p.secondEndTime ?? p.endTime;
    return p.endsNextDay ? 24 * 60 - toMinutes(p.startTime) + toMinutes(end) : toMinutes(end) - toMinutes(p.startTime);
  }

  static create(id: string, details: ShiftTemplateDetails, createdBy: string | null, now: Date): ShiftTemplate {
    const iso = now.toISOString();
    return new ShiftTemplate({ id, ...clean(details), active: true, createdBy, createdAt: iso, updatedAt: iso });
  }

  static reconstitute(props: Omit<ShiftTemplateProps, "group"> & { group?: ShiftTemplateGroup }): ShiftTemplate {
    return new ShiftTemplate({ ...props, group: props.group ?? "OTHER" });
  }

  update(changes: Partial<ShiftTemplateDetails>, now: Date): ShiftTemplate {
    const merged = clean({ ...this.details(), ...changes });
    return new ShiftTemplate({ ...this.props, ...merged, updatedAt: now.toISOString() });
  }

  setActive(active: boolean, now: Date): ShiftTemplate {
    return new ShiftTemplate({ ...this.props, active, updatedAt: now.toISOString() });
  }

  details(): ShiftTemplateDetails {
    const { id: _id, active: _a, createdBy: _c, createdAt: _ca, updatedAt: _u, ...details } = this.props;
    return details;
  }

  toProps(): ShiftTemplateProps {
    return { ...this.props };
  }
}
