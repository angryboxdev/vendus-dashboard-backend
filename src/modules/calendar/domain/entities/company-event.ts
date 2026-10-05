import { InvalidCalendarEntryError } from "../errors.js";
import { isIsoDate } from "./holiday.js";

export type EventPriority = "normal" | "important" | "critical";
/** `all` = qualquer pessoa com acesso ao Hub; `management` = gestores e administradores. */
export type EventVisibility = "all" | "management";
export type EventStatus = "active" | "cancelled";

/** Categorias fixas nesta fase — um evento empresarial nunca é um feriado. */
export const EVENT_CATEGORIES = ["meeting", "audit", "training", "maintenance", "inspection", "deadline", "other"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export interface CompanyEventProps {
  id: string;
  title: string;
  date: string;
  allDay: boolean;
  /** HH:MM — só quando `allDay` é falso. */
  startTime: string | null;
  endTime: string | null;
  description: string | null;
  category: EventCategory;
  /** `null` = empresa inteira. */
  locationId: string | null;
  priority: EventPriority;
  responsible: string | null;
  visibility: EventVisibility;
  status: EventStatus;
  createdBy: string;
  updatedAt: string;
}

export type CompanyEventDetails = Omit<CompanyEventProps, "id" | "status" | "createdBy" | "updatedAt">;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function trimOrNull(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

function clean(d: CompanyEventDetails): CompanyEventDetails {
  const title = d.title.trim();
  if (title.length === 0) throw new InvalidCalendarEntryError("Título é obrigatório");
  if (title.length > 160) throw new InvalidCalendarEntryError("Título: máximo 160 caracteres");
  if (!isIsoDate(d.date)) throw new InvalidCalendarEntryError("Data inválida");
  if (!EVENT_CATEGORIES.includes(d.category)) throw new InvalidCalendarEntryError("Categoria inválida");
  if (!["normal", "important", "critical"].includes(d.priority)) throw new InvalidCalendarEntryError("Prioridade inválida");
  if (!["all", "management"].includes(d.visibility)) throw new InvalidCalendarEntryError("Visibilidade inválida");
  let startTime = trimOrNull(d.startTime);
  let endTime = trimOrNull(d.endTime);
  if (d.allDay) {
    startTime = null;
    endTime = null;
  } else {
    if (!startTime || !TIME.test(startTime)) throw new InvalidCalendarEntryError("Hora de início inválida (HH:MM)");
    if (endTime && !TIME.test(endTime)) throw new InvalidCalendarEntryError("Hora de fim inválida (HH:MM)");
    if (endTime && endTime <= startTime) throw new InvalidCalendarEntryError("A hora de fim tem de ser depois da de início");
  }
  return {
    ...d,
    title,
    startTime,
    endTime,
    description: trimOrNull(d.description),
    responsible: trimOrNull(d.responsible),
  };
}

/**
 * Evento empresarial (task §7) — informativo/operacional. Por construção
 * não tem nenhuma ligação a escalas, férias, assiduidade ou remuneração.
 * Imutável; nunca apagado — `cancel()`.
 */
export class CompanyEvent {
  private constructor(private readonly props: CompanyEventProps) {}

  get id(): string {
    return this.props.id;
  }
  get status(): EventStatus {
    return this.props.status;
  }
  get locationId(): string | null {
    return this.props.locationId;
  }

  static create(id: string, details: CompanyEventDetails, createdBy: string, now: Date): CompanyEvent {
    return new CompanyEvent({ id, ...clean(details), status: "active", createdBy, updatedAt: now.toISOString() });
  }

  static reconstitute(props: CompanyEventProps): CompanyEvent {
    return new CompanyEvent({ ...props });
  }

  update(changes: Partial<CompanyEventDetails>, now: Date): CompanyEvent {
    if (this.props.status === "cancelled") throw new InvalidCalendarEntryError("Um evento cancelado não pode ser alterado");
    const { id: _id, status: _s, createdBy: _c, updatedAt: _u, ...details } = this.props;
    return new CompanyEvent({ ...this.props, ...clean({ ...details, ...changes }), updatedAt: now.toISOString() });
  }

  cancel(now: Date): CompanyEvent {
    return new CompanyEvent({ ...this.props, status: "cancelled", updatedAt: now.toISOString() });
  }

  toProps(): CompanyEventProps {
    return { ...this.props };
  }
}
