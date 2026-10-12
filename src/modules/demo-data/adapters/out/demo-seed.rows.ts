import type { DemoDataset } from "../../domain/entities/demo-dataset.js";

/**
 * Linhas a gravar na organização de demonstração, por tabela e pela ordem
 * das chaves estrangeiras. Puro (ids vindos de `newId`) para se poder
 * validar contra um Postgres real nos testes de migração. Sem `org_id`:
 * o ScopedQuery carimba-o.
 */
export type Row = Record<string, unknown>;

export interface SeedPlan {
  locations: Row[];
  positions: Row[];
  employees: Row[];
  contracts: Row[];
  schedules: Row[];
  scheduleVersions: Row[];
  assignments: Row[];
  holidayCalendars: Row[];
  holidayDays: Row[];
  clockEvents: Row[];
  absenceTypes: Row[];
}

const WEEKDAYS = ["1", "2", "3", "4", "5", "6", "7"];

export function buildSeedPlan(
  d: DemoDataset,
  opts: { newId: () => string; actor: string; year: number; ptHolidays: { date: string; name: string }[] },
): SeedPlan {
  const { newId, actor } = opts;
  const locId = new Map<string, string>();
  const locations = d.centers.map((c, i) => {
    const id = newId();
    locId.set(c.key, id);
    return { id, name: c.name, code: `DEMO-${i + 1}`, timezone: c.timeZone, country: c.country, is_active: true };
  });

  const posId = new Map<string, string>();
  const positions: Row[] = [];
  for (const name of [...new Set(d.positions.map((p) => p.name))]) {
    const id = newId();
    positions.push({ id, name, active: true });
    for (const p of d.positions.filter((x) => x.name === name)) posId.set(p.key, id);
  }

  // Um horário por modelo (os dois "tenants" do gerador partilham os mesmos modelos).
  const schedId = new Map<string, string>();
  const schedules: Row[] = [];
  const scheduleVersions: Row[] = [];
  for (const name of [...new Set(d.schedules.map((s) => s.name))]) {
    const s = d.schedules.find((x) => x.name === name)!;
    const id = newId();
    schedules.push({ id, name: `${name} (demo)`, kind: "fixed", created_by: actor });
    const days = Object.fromEntries(WEEKDAYS.filter((w) => s.weekdays.includes(Number(w))).map((w) => [w, [{ start: s.start, end: s.end }]]));
    scheduleVersions.push({ id: newId(), schedule_id: id, valid_from: `${opts.year - 1}-01-01`, valid_to: null, days, night: s.endsNextDay, created_by: actor });
    for (const x of d.schedules.filter((y) => y.name === name)) schedId.set(x.key, id);
  }

  const empId = new Map<string, string>();
  const employees: Row[] = [];
  const contracts: Row[] = [];
  const assignments: Row[] = [];
  for (const e of d.employees) {
    const id = newId();
    empId.set(e.key, id);
    employees.push({
      id,
      full_name: `${e.firstName} ${e.lastName}`,
      first_name: e.firstName,
      last_name: e.lastName,
      email: e.email,
      status: "active",
      hired_at: e.hireDate,
      primary_location_id: locId.get(e.centerKey),
      position_id: posId.get(e.positionKey) ?? null,
      role_or_notes: "Colaborador fictício (demonstração)",
    });
    contracts.push({ id: newId(), employee_id: id, contract_type: "permanent", start_date: e.hireDate, weekly_hours: 40, status: "active", created_by: actor });
    assignments.push({ id: newId(), resource_type: "schedule", resource_id: schedId.get(e.scheduleKey), target_type: "employee", target_id: id, valid_from: `${opts.year - 1}-01-01`, created_by: actor });
  }

  // Feriados nacionais de Portugal (cálculo do módulo calendar), "a confirmar" (sem valores legais dados como certos), nos centros PT.
  const calId = newId();
  const holidayCalendars: Row[] = [{ id: calId, name: "Feriados Portugal (demo)", country: "PT", compensation_coefficient: 1, created_by: actor }];
  const holidayDays: Row[] = opts.ptHolidays.map((h) => ({ id: newId(), calendar_id: calId, date: h.date, name: h.name, kind: "national", status: "to_confirm", source: "Cálculo nacional (demonstração) — a confirmar", created_by: actor }));
  for (const c of d.centers.filter((x) => x.country === "PT")) {
    assignments.push({ id: newId(), resource_type: "holiday_calendar", resource_id: calId, target_type: "location", target_id: locId.get(c.key), valid_from: `${opts.year - 1}-01-01`, created_by: actor });
  }

  const centerOf = new Map(d.employees.map((e) => [e.key, e.centerKey]));
  const clockEvents = d.punches.map((p) => ({
    id: newId(),
    employee_id: empId.get(p.employeeKey),
    occurred_at: p.atUtc,
    segment_type: p.kind === "in" ? "work" : "off",
    source: "web",
    client_event_id: p.clientEventId,
    location_id: locId.get(centerOf.get(p.employeeKey)!) ?? null,
  }));

  const absenceTypes: Row[] = [
    { id: newId(), name: "Consulta médica (demo)", category: "permission", unit: "hours", counting: "working", limit_amount: 18, requires_approval: true, time_impact: "reduce_theoretical", created_by: actor },
    { id: newId(), name: "Formação (demo)", category: "permission", unit: "days", counting: "working", limit_amount: null, requires_approval: false, time_impact: "count_as_worked", created_by: actor },
    { id: newId(), name: "Compensação de feriado (demo)", category: "compensation", unit: "days", counting: "calendar", limit_amount: null, requires_approval: false, time_impact: "reduce_theoretical", created_by: actor },
  ];

  return { locations, positions, employees, contracts, schedules, scheduleVersions, assignments, holidayCalendars, holidayDays, clockEvents, absenceTypes };
}
