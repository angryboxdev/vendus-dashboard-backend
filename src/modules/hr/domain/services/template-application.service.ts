import type { Employee } from "../entities/employee.js";
import type { WorkShift, WorkShiftSegment } from "../entities/work-shift.js";
import type { Weekday } from "../entities/base-schedule-template.js";
import { occurrenceOverlapsShift } from "./shift-recurrence.service.js";

/**
 * Aplicar um Modelo de turno (RH 2.0, ticket 02 — task §4–§6). Motor puro,
 * usado tal e qual pela pré-visualização e pela confirmação: na confirmação
 * tudo é recalculado com os dados atuais (revalidação, §5) e só o que
 * continua válido é criado — nunca há substituição silenciosa nem
 * duplicação (idempotência, §6).
 */

/** A quem aplicar (§4). "Por local" = local principal ou autorizado. */
export type ApplicationAudience =
  | { kind: "employees"; employeeIds: string[] }
  | { kind: "all" }
  | { kind: "position"; positionId: string; locationId?: string | null }
  | { kind: "location"; locationId: string };

/** Quando (§4): datas específicas, ou um intervalo com dias da semana (Seg–Sex, fins de semana, personalizado). */
export type ApplicationDays = { kind: "dates"; dates: string[] } | { kind: "range"; from: string; to: string; weekdays: Weekday[] };

export type OccurrenceStatus =
  /** Pronta a criar. */
  | "valid"
  /** Já existe exatamente este turno — nada a fazer (gerar de novo nunca duplica). */
  | "duplicate"
  /** Sobrepõe outro turno do colaborador — Manter / Substituir / Ignorar. */
  | "overlap"
  /** Férias/ausência no dia — "Colaborador indisponível", nunca criada. */
  | "leave"
  | "inactive_employee"
  /** Nenhum local resolvido (aplicação, modelo e colaborador sem local). */
  | "no_location"
  | "inactive_location";

export interface PlannedTemplateOccurrence {
  /** `${employeeId}|${workDate}` — chave estável entre pré-visualização e confirmação. */
  key: string;
  employeeId: string;
  workDate: string;
  segments: WorkShiftSegment[];
  endsNextDay: boolean;
  /** Local resolvido: aplicação → modelo → local principal do colaborador (§4). */
  locationId: string | null;
  status: OccurrenceStatus;
  /** Nome do feriado, se for (R4: o turno cria-se na mesma, só assinalado). */
  holidayName: string | null;
  /** Turno existente em causa (duplicate/overlap). */
  existingShiftId: string | null;
  /** O turno existente já tem presença registada — nunca pode ser substituído (R3). */
  existingHasAttendance: boolean;
}

export const MAX_APPLICATION_DAYS = 366;

const addDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (ymd: string) => ((new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7) as Weekday;

/** Datas concretas (ordenadas, sem repetidos). Lança `RangeError` com mensagem de negócio se o pedido for inválido. */
export function expandApplicationDays(days: ApplicationDays): string[] {
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  if (days.kind === "dates") {
    if (days.dates.length === 0) throw new RangeError("Escolha pelo menos uma data");
    if (!days.dates.every(valid)) throw new RangeError("Data inválida");
    const unique = [...new Set(days.dates)].sort();
    if (unique.length > MAX_APPLICATION_DAYS) throw new RangeError(`No máximo ${MAX_APPLICATION_DAYS} datas`);
    return unique;
  }
  if (!valid(days.from) || !valid(days.to)) throw new RangeError("Período inválido");
  if (days.to < days.from) throw new RangeError("A data final tem de ser igual ou posterior à inicial");
  if (days.weekdays.length === 0) throw new RangeError("Escolha pelo menos um dia da semana");
  const out: string[] = [];
  for (let d = days.from, i = 0; d <= days.to; d = addDays(d, 1), i++) {
    if (i >= MAX_APPLICATION_DAYS) throw new RangeError(`Período demasiado longo (máximo ${MAX_APPLICATION_DAYS} dias)`);
    if (days.weekdays.includes(weekdayOf(d))) out.push(d);
  }
  if (out.length === 0) throw new RangeError("O período escolhido não tem nenhum dos dias da semana selecionados");
  return out;
}

/**
 * Colaboradores abrangidos. Público por Cargo/Local/Todos é avaliado agora
 * (só ativos); uma lista explícita mantém os indicados, mesmo inativos —
 * esses aparecem como `inactive_employee` em vez de desaparecerem.
 */
export function resolveAudience(audience: ApplicationAudience, employees: readonly Employee[]): Employee[] {
  const worksAt = (e: Employee, locationId: string) => e.primaryLocationId === locationId || e.authorizedLocationIds.includes(locationId);
  switch (audience.kind) {
    case "employees": {
      const ids = new Set(audience.employeeIds);
      return employees.filter((e) => ids.has(e.id));
    }
    case "all":
      return employees.filter((e) => e.status === "active");
    case "position":
      return employees.filter(
        (e) => e.status === "active" && e.positionId === audience.positionId && (!audience.locationId || worksAt(e, audience.locationId)),
      );
    case "location":
      return employees.filter((e) => e.status === "active" && worksAt(e, audience.locationId));
  }
}

const sameShape = (a: { segments: WorkShiftSegment[]; endsNextDay: boolean }, b: { segments: WorkShiftSegment[]; endsNextDay: boolean }) =>
  a.endsNextDay === b.endsNextDay &&
  a.segments.length === b.segments.length &&
  a.segments.every((s, i) => s.startTime === b.segments[i]!.startTime && s.endTime === b.segments[i]!.endTime);

export function planTemplateApplication(params: {
  template: { segments: WorkShiftSegment[]; endsNextDay: boolean; locationId: string | null };
  employees: readonly Employee[];
  dates: readonly string[];
  /** Local escolhido na aplicação (1.º na precedência). */
  applicationLocationId: string | null;
  activeLocationIds: ReadonlySet<string>;
  existingShifts: readonly WorkShift[];
  shiftIdsWithAttendance: ReadonlySet<string>;
  leaves: readonly { employeeId: string; startDate: string; endDate: string }[];
  holidays: readonly { date: string; name: string }[];
}): PlannedTemplateOccurrence[] {
  const holidayByDate = new Map(params.holidays.map((h) => [h.date, h.name]));
  const shiftsByEmployee = new Map<string, WorkShift[]>();
  for (const s of params.existingShifts) shiftsByEmployee.set(s.employeeId, [...(shiftsByEmployee.get(s.employeeId) ?? []), s]);

  const out: PlannedTemplateOccurrence[] = [];
  for (const employee of params.employees) {
    const locationId = params.applicationLocationId ?? params.template.locationId ?? employee.primaryLocationId;
    for (const workDate of params.dates) {
      const occurrence = { workDate, weekday: weekdayOf(workDate), segments: params.template.segments, endsNextDay: params.template.endsNextDay };
      const base = {
        key: `${employee.id}|${workDate}`,
        employeeId: employee.id,
        workDate,
        segments: params.template.segments,
        endsNextDay: params.template.endsNextDay,
        locationId,
        holidayName: holidayByDate.get(workDate) ?? null,
        existingShiftId: null as string | null,
        existingHasAttendance: false,
      };
      const overlapping = (shiftsByEmployee.get(employee.id) ?? []).filter((s) => occurrenceOverlapsShift(occurrence, s));
      const identical = overlapping.find((s) => s.workDate === workDate && s.locationId === locationId && sameShape(s, occurrence));

      let status: OccurrenceStatus;
      if (employee.status !== "active") status = "inactive_employee";
      else if (params.leaves.some((l) => l.employeeId === employee.id && l.startDate <= workDate && l.endDate >= workDate)) status = "leave";
      else if (identical) status = "duplicate";
      else if (overlapping.length > 0) status = "overlap";
      else if (locationId === null) status = "no_location";
      else if (!params.activeLocationIds.has(locationId)) status = "inactive_location";
      else status = "valid";

      const existing = identical ?? overlapping[0] ?? null;
      out.push({
        ...base,
        status,
        existingShiftId: status === "duplicate" || status === "overlap" ? existing!.id : null,
        existingHasAttendance: existing ? params.shiftIdsWithAttendance.has(existing.id) : false,
      });
    }
  }
  return out.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.employeeId.localeCompare(b.employeeId));
}

/** Decisão do utilizador por ocorrência: `create` (válidas, por omissão), `replace` (só sobreposições sem presença) ou `skip`. */
export type OccurrenceDecision = { action: "create" | "skip" } | { action: "replace"; existingShiftId: string };

export type ConfirmOutcome =
  | { kind: "create"; occurrence: PlannedTemplateOccurrence }
  | { kind: "replace"; occurrence: PlannedTemplateOccurrence; existingShiftId: string }
  | { kind: "skip"; occurrence: PlannedTemplateOccurrence; reason: "user" | "not_creatable" | "changed" };

/**
 * Confirmação (§5, teste crítico 3): cruza as decisões tomadas sobre a
 * pré-visualização com o plano recalculado agora. Uma ocorrência que
 * mudou de estado entretanto (nova ausência, turno criado por outro
 * gestor, presença registada…) nunca é forçada — sai como `changed`.
 */
export function resolveConfirmation(
  current: readonly PlannedTemplateOccurrence[],
  decisions: Readonly<Record<string, OccurrenceDecision>>,
): ConfirmOutcome[] {
  return current.map((occurrence) => {
    const decision = decisions[occurrence.key];
    if (occurrence.status === "valid") {
      if (decision?.action === "skip") return { kind: "skip", occurrence, reason: "user" };
      if (decision?.action === "create") return { kind: "create", occurrence };
      // Sem decisão = não estava na pré-visualização (ex.: alguém entrou no cargo entretanto) — nunca criada às cegas.
      if (decision === undefined) return { kind: "skip", occurrence, reason: "changed" };
      return { kind: "skip", occurrence, reason: "changed" }; // pediu substituir, mas já não há o que substituir
    }
    if (occurrence.status === "overlap" && decision?.action === "replace") {
      const stillSame = decision.existingShiftId === occurrence.existingShiftId && !occurrence.existingHasAttendance;
      return stillSame
        ? { kind: "replace", occurrence, existingShiftId: occurrence.existingShiftId! }
        : { kind: "skip", occurrence, reason: "changed" };
    }
    if (decision?.action === "create" || decision?.action === "replace") return { kind: "skip", occurrence, reason: "changed" };
    return { kind: "skip", occurrence, reason: decision?.action === "skip" ? "user" : "not_creatable" };
  });
}
