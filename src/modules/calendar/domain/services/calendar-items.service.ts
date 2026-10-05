import type { CompanyEvent, EventPriority, EventCategory, EventVisibility } from "../entities/company-event.js";
import type { Holiday, HolidayType } from "../entities/holiday.js";

export type CalendarItemKind = "holiday" | "event" | "deadline";

/**
 * Uma entrada do calendário corporativo único (task §5) — feriados, eventos
 * empresariais e prazos/vencimentos derivados de documentos. O Dashboard
 * futuro deve consumir esta mesma lista, nunca montar outro calendário.
 */
export interface CalendarItem {
  /** `holiday:<id>`, `event:<id>` ou `deadline:<id do documento>` — único na lista. */
  key: string;
  id: string;
  kind: CalendarItemKind;
  date: string;
  title: string;
  /** `null` = empresa inteira. */
  locationId: string | null;
  /** Feriados não têm prioridade; eventos e prazos sim. */
  priority: EventPriority | null;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  holidayType?: HolidayType;
  category?: EventCategory;
  description?: string | null;
  responsible?: string | null;
  visibility?: EventVisibility;
  /** Ticket 05 — origem do prazo (`source_type = DOCUMENT`, `source_id`). */
  source?: { type: "document"; id: string; category: string };
}

/** Prazo de um documento da Empresa com validade (ticket 05) — sempre derivado do documento atual, nunca persistido à parte. */
export interface DocumentDeadline {
  documentId: string;
  category: string;
  categoryLabel: string;
  expiresAt: string;
}

export type CalendarViewerRole = "admin" | "manager" | "hr_viewer";

export function holidayToItem(h: Holiday): CalendarItem {
  return {
    key: `holiday:${h.id}`,
    id: h.id,
    kind: "holiday",
    date: h.date,
    title: h.name,
    locationId: h.locationId,
    priority: null,
    allDay: true,
    startTime: null,
    endTime: null,
    holidayType: h.type,
  };
}

export function eventToItem(e: CompanyEvent): CalendarItem {
  const p = e.toProps();
  return {
    key: `event:${p.id}`,
    id: p.id,
    kind: "event",
    date: p.date,
    title: p.title,
    locationId: p.locationId,
    priority: p.priority,
    allDay: p.allDay,
    startTime: p.startTime,
    endTime: p.endTime,
    category: p.category,
    description: p.description,
    responsible: p.responsible,
    visibility: p.visibility,
  };
}

/**
 * Prioridade do prazo pela proximidade (task §8, exemplo "Renovação seguro —
 * Crítico"): já passou ou faltam ≤ 15 dias → crítico; ≤ 45 dias →
 * importante; senão normal.
 */
export function deadlinePriority(expiresAt: string, today: string): EventPriority {
  const days = Math.round((Date.parse(`${expiresAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days <= 15) return "critical";
  if (days <= 45) return "important";
  return "normal";
}

export function deadlineToItem(d: DocumentDeadline, today: string): CalendarItem {
  return {
    key: `deadline:${d.documentId}`,
    id: d.documentId,
    kind: "deadline",
    date: d.expiresAt,
    title: `${d.categoryLabel} vence`,
    locationId: null,
    priority: deadlinePriority(d.expiresAt, today),
    allDay: true,
    startTime: null,
    endTime: null,
    source: { type: "document", id: d.documentId, category: d.category },
  };
}

export interface CalendarFilter {
  kinds?: CalendarItemKind[];
  /** Mostra os itens desse Local e os da empresa inteira. */
  locationId?: string;
  priority?: EventPriority;
}

/** Visibilidade + filtros da task §5 (Todos/Feriados/Eventos/Prazos, Local, Prioridade). */
export function filterCalendarItems(items: CalendarItem[], filter: CalendarFilter, role: CalendarViewerRole): CalendarItem[] {
  return items
    .filter((i) => role !== "hr_viewer" || (i.kind !== "deadline" && i.visibility !== "management"))
    .filter((i) => !filter.kinds || filter.kinds.length === 0 || filter.kinds.includes(i.kind))
    .filter((i) => !filter.locationId || i.locationId === null || i.locationId === filter.locationId)
    .filter((i) => !filter.priority || i.priority === filter.priority)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.title.localeCompare(b.title, "pt"));
}

/**
 * "Próximos eventos importantes" (task §8): a partir de hoje, feriados,
 * prazos e eventos Importantes/Críticos — eventos normais ficam de fora.
 */
export function upcomingImportant(items: CalendarItem[], today: string, limit: number): CalendarItem[] {
  return items
    .filter((i) => i.date >= today)
    .filter((i) => i.kind !== "event" || i.priority === "important" || i.priority === "critical")
    .slice(0, limit);
}
