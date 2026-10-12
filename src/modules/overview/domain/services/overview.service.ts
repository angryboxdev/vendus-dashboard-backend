import type { LocationSummary, OverviewAbsence, OverviewDay, OverviewKpis, PersonDayView, PersonOverview, PersonStatus, WeekPoint } from "../entities/overview.js";

/** Ausência aprovada que cobre a data (o nome do tipo, ou null). */
export function absenceOn(absences: OverviewAbsence[], employeeId: string, date: string): string | null {
  return absences.find((a) => a.employeeId === employeeId && a.startDate <= date && a.endDate >= date)?.typeName ?? null;
}

/** Estado de um dia. Dias passados nunca estão "por começar": com horário e sem marcação é falta. */
export function classifyDay(day: OverviewDay, absenceType: string | null, today: string): PersonStatus {
  if (day.openType === "work") return "working";
  if (day.openType === "remote") return "remote";
  if (day.openType === "break_paid" || day.openType === "break_unpaid") return "break";
  if (day.firstInAt) return "finished";
  if (absenceType || (day.excused && day.theoreticalSeconds > 0)) return "absent";
  if (day.theoreticalSeconds <= 0) return "day_off";
  if (day.workDate > today) return "not_started";
  if (day.workDate === today && !day.startPassed) return "not_started";
  return "missing";
}

export function dayView(day: OverviewDay, absenceType: string | null, today: string): PersonDayView {
  return {
    date: day.workDate,
    status: classifyDay(day, absenceType, today),
    lateMinutes: day.lateMinutes,
    workedSeconds: day.workedSeconds,
    theoreticalSeconds: day.theoreticalSeconds,
    plannedStart: day.plannedStart,
    plannedEnd: day.plannedEnd,
    firstInAt: day.firstInAt,
    absenceType,
  };
}

const PRESENT: PersonStatus[] = ["working", "remote", "break", "finished"];

export function kpis(people: PersonOverview[]): OverviewKpis {
  const n = (s: PersonStatus) => people.filter((p) => p.status === s).length;
  return {
    people: people.length,
    scheduled: people.filter((p) => p.theoreticalSeconds > 0).length,
    working: n("working"),
    remote: n("remote"),
    onBreak: n("break"),
    finished: n("finished"),
    absent: n("absent"),
    missing: n("missing"),
    late: people.filter((p) => p.lateMinutes > 0).length,
    notStarted: n("not_started"),
  };
}

export function byLocation(people: PersonOverview[]): LocationSummary[] {
  const map = new Map<string, LocationSummary>();
  for (const p of people) {
    const key = p.locationId ?? "";
    const cur = map.get(key) ?? { locationId: p.locationId, name: p.locationName ?? "Sem centro", people: 0, present: 0, absent: 0, missing: 0, late: 0 };
    cur.people++;
    if (PRESENT.includes(p.status)) cur.present++;
    if (p.status === "absent") cur.absent++;
    if (p.status === "missing") cur.missing++;
    if (p.lateMinutes > 0) cur.late++;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

export function weekTrend(people: PersonOverview[], dates: string[]): WeekPoint[] {
  return dates.map((date) => {
    const days = people.map((p) => p.week.find((d) => d.date === date)).filter((d): d is PersonDayView => !!d);
    return {
      date,
      late: days.filter((d) => d.lateMinutes > 0).length,
      missing: days.filter((d) => d.status === "missing").length,
      absent: days.filter((d) => d.status === "absent").length,
      workedSeconds: days.reduce((s, d) => s + d.workedSeconds, 0),
      theoreticalSeconds: days.reduce((s, d) => s + d.theoreticalSeconds, 0),
    };
  });
}

/** Ordem da lista: o que pede atenção primeiro (faltas, atrasos), depois os presentes; por nome. */
const ORDER: PersonStatus[] = ["missing", "working", "remote", "break", "finished", "not_started", "absent", "day_off"];
export function sortPeople(people: PersonOverview[]): PersonOverview[] {
  const rank = (p: PersonOverview) => (p.status === "missing" ? 0 : p.lateMinutes > 0 ? 1 : 2);
  return [...people].sort((a, b) => rank(a) - rank(b) || ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.name.localeCompare(b.name, "pt"));
}
