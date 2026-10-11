import { mintOrganizationId, type OrganizationId } from "../../../kernel/organization-id.js";
import { TimeBaseUseCases } from "../application/use-cases/time-base.use-cases.js";
import type { EmployeeUnitsAt, HolidayCalendar, HolidayDay, TimeAssignment, VacationCalendar } from "../domain/entities/calendars.js";
import type { ScheduleVersion, WorkSchedule } from "../domain/entities/schedule.js";
import { TimeConflictError, TimeValidationError } from "../domain/errors.js";
import type { TimeBaseRepositoryPort } from "../domain/ports/out/time-base.ports.js";
import type { TheoreticalMode } from "../domain/services/theoretical.service.js";
import { dayBoundsUtc, localDateOf, localTimeToUtc } from "../domain/services/workday.service.js";

const ORG = mintOrganizationId("org-test");
const A = "rh@demo.invalid";

class FakeRepo implements TimeBaseRepositoryPort {
  schedules: WorkSchedule[] = [];
  versions: ScheduleVersion[] = [];
  hcals: (HolidayCalendar & { deleted?: boolean })[] = [];
  hdays: HolidayDay[] = [];
  vcals: (VacationCalendar & { deleted?: boolean })[] = [];
  assignments: TimeAssignment[] = [];
  private n = 0;
  private id = (p: string) => `${p}${++this.n}`;
  async listSchedules() {
    return [...this.schedules];
  }
  async createSchedule(_o: OrganizationId, i: { name: string; kind: WorkSchedule["kind"] }) {
    const s = { id: this.id("s"), name: i.name, kind: i.kind, archived: false };
    this.schedules.push(s);
    return s;
  }
  async archiveSchedule(_o: OrganizationId, id: string) {
    this.schedules.find((s) => s.id === id)!.archived = true;
  }
  async listVersions() {
    return this.versions.map((v) => ({ ...v }));
  }
  async createVersion(_o: OrganizationId, i: Omit<ScheduleVersion, "id">) {
    const v = { ...i, id: this.id("v") };
    this.versions.push(v);
    return v;
  }
  async endVersion(_o: OrganizationId, id: string, validTo: string) {
    this.versions.find((v) => v.id === id)!.validTo = validTo;
  }
  async listHolidayCalendars() {
    return this.hcals.filter((c) => !c.deleted);
  }
  async createHolidayCalendar(_o: OrganizationId, i: Omit<HolidayCalendar, "id">) {
    const c = { ...i, id: this.id("hc") };
    this.hcals.push(c);
    return c;
  }
  async updateHolidayCalendar(_o: OrganizationId, id: string, p: Partial<HolidayCalendar>) {
    const c = this.hcals.find((x) => x.id === id)!;
    Object.assign(c, p);
    return { ...c };
  }
  async deleteHolidayCalendar(_o: OrganizationId, id: string) {
    this.hcals.find((x) => x.id === id)!.deleted = true;
  }
  async listHolidayDays(_o: OrganizationId, calendarId?: string) {
    return this.hdays.filter((d) => !calendarId || d.calendarId === calendarId);
  }
  async insertHolidayDays(_o: OrganizationId, days: Omit<HolidayDay, "id">[]) {
    const out = days.map((d) => ({ ...d, id: this.id("hd") }));
    this.hdays.push(...out);
    return out;
  }
  async updateHolidayDay(_o: OrganizationId, id: string, p: Partial<HolidayDay>) {
    const d = this.hdays.find((x) => x.id === id)!;
    Object.assign(d, p);
    return { ...d };
  }
  async deleteHolidayDay(_o: OrganizationId, id: string) {
    this.hdays = this.hdays.filter((d) => d.id !== id);
  }
  async listVacationCalendars() {
    return this.vcals.filter((c) => !c.deleted);
  }
  async createVacationCalendar(_o: OrganizationId, i: Omit<VacationCalendar, "id">) {
    const c = { ...i, id: this.id("vc") };
    this.vcals.push(c);
    return c;
  }
  async updateVacationCalendar(_o: OrganizationId, id: string, i: Omit<VacationCalendar, "id">) {
    const c = this.vcals.find((x) => x.id === id)!;
    Object.assign(c, i);
    return { ...c };
  }
  async deleteVacationCalendar(_o: OrganizationId, id: string) {
    this.vcals.find((x) => x.id === id)!.deleted = true;
  }
  async listAssignments() {
    return this.assignments.map((a) => ({ ...a }));
  }
  async createAssignment(_o: OrganizationId, i: Omit<TimeAssignment, "id">) {
    const a = { ...i, id: this.id("a") };
    this.assignments.push(a);
    return a;
  }
  async endAssignment(_o: OrganizationId, id: string, validTo: string) {
    const a = this.assignments.find((x) => x.id === id)!;
    a.validTo = validTo;
    return { ...a };
  }
}

const UNITS: EmployeeUnitsAt = { employeeId: "e1", locationIds: ["loc-porto"], departmentIds: [], groupIds: [] };

function setup(opts: { mode?: TheoreticalMode; contractMinutes?: number | null } = {}) {
  const repo = new FakeRepo();
  const events: string[] = [];
  const uc = new TimeBaseUseCases(
    repo,
    {
      unitsAt: async (_o, employeeId) => ({ ...UNITS, employeeId }),
      contractWeeklyMinutesAt: async () => opts.contractMinutes ?? null,
      theoreticalModeAt: async () => opts.mode ?? "schedule",
    },
    { countEmployees: async (_o, targets) => targets.length * 4 },
    { forCountry: (c, y) => (c === "PT" ? [{ date: `${y}-01-01`, name: "Ano Novo" }, { date: `${y}-04-25`, name: "Dia da Liberdade" }, { date: `${y}-12-25`, name: "Natal" }] : null) },
    { record: async (_o, e) => void events.push(e.action) },
    { today: async () => "2026-10-11" },
  );
  return { repo, uc, events };
}

const WEEKDAYS_9_TO_6 = { "1": [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }], "2": [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }], "3": [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }], "4": [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }], "5": [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }] };
const V = (days: object, from = "2026-01-01", extra: Partial<ScheduleVersion> = {}) => ({ validFrom: from, validTo: null, days, night: false, halfDayMinutes: null, ...extra });

async function withSchedule(uc: TimeBaseUseCases, kind: "fixed" | "flexible", days: object, extra: Partial<ScheduleVersion> = {}) {
  const s = await uc.createSchedule(ORG, A, { name: `H ${kind} ${Math.random()}`, kind, firstVersion: V(days, "2026-01-01", extra) });
  await uc.assign(ORG, A, { resourceType: "schedule", resourceId: s.id, targetType: "location", targetId: "loc-porto", validFrom: "2026-01-01", validTo: null });
  return s;
}

describe("Tempo teórico diário (TK-11)", () => {
  test("TK_11_horario_fixo_jornada_partida_e_descanso_ao_fim_de_semana", async () => {
    const { uc } = setup();
    await withSchedule(uc, "fixed", WEEKDAYS_9_TO_6);
    const r = await uc.theoretical(ORG, "e1", "2026-10-09", "2026-10-11"); // sex, sáb, dom
    expect(r.days.map((d) => [d.date, d.minutes, d.reason])).toEqual([
      ["2026-10-09", 480, "schedule"],
      ["2026-10-10", 0, "rest_day"],
      ["2026-10-11", 0, "rest_day"],
    ]);
    expect(r.totalMinutes).toBe(480);
  });

  test("TK_11_horario_flexivel_minutos_por_dia", async () => {
    const { uc } = setup();
    await withSchedule(uc, "flexible", { "1": 480, "2": 480, "3": 480, "4": 480, "5": 360 });
    const r = await uc.theoretical(ORG, "e1", "2026-10-05", "2026-10-09");
    expect(r.days.map((d) => d.minutes)).toEqual([480, 480, 480, 480, 360]);
  });

  test("TK_11_feriado_confirmado_zera_o_teorico_e_a_confirmar_so_avisa", async () => {
    const { uc } = setup();
    await withSchedule(uc, "fixed", WEEKDAYS_9_TO_6);
    const cal = await uc.createHolidayCalendar(ORG, A, { name: "Porto", country: "PT", compensationCoefficient: 1, approvalRequired: false, accruedExpires: false, halfDayCompensation: false });
    await uc.assign(ORG, A, { resourceType: "holiday_calendar", resourceId: cal.id, targetType: "location", targetId: "loc-porto", validFrom: "2026-01-01", validTo: null });
    const sj = await uc.addHoliday(ORG, A, cal.id, { date: "2026-06-24", name: "São João", kind: "municipal", status: "confirmed", coefficient: null, source: "CM Porto" });
    await uc.addHoliday(ORG, A, cal.id, { date: "2026-06-25", name: "Teste a confirmar", kind: "custom", status: "to_confirm", coefficient: null, source: null });
    const r = await uc.theoretical(ORG, "e1", "2026-06-24", "2026-06-25");
    expect(r.days[0]).toMatchObject({ minutes: 0, reason: "holiday", holidayName: "São João" });
    expect(r.days[1]).toMatchObject({ minutes: 480, reason: "schedule", warnings: ["holiday_to_confirm"] });
    expect(sj.status).toBe("confirmed");
  });

  test("TK_11_mudanca_de_versao_do_horario_a_meio_do_mes", async () => {
    const { uc, repo } = setup();
    const s = await withSchedule(uc, "flexible", { "1": 480, "2": 480, "3": 480, "4": 480, "5": 480 });
    await uc.addVersion(ORG, A, s.id, V({ "1": 360, "2": 360, "3": 360, "4": 360, "5": 360 }, "2026-10-15"));
    expect(repo.versions[0]!.validTo).toBe("2026-10-14");
    const r = await uc.theoretical(ORG, "e1", "2026-10-14", "2026-10-15");
    expect(r.days.map((d) => d.minutes)).toEqual([480, 360]);
    await expect(uc.addVersion(ORG, A, s.id, V({ "1": 60 }, "2026-10-10"))).rejects.toBeInstanceOf(TimeConflictError);
  });

  test("TK_11_meio_dia_usa_a_definicao_do_horario_ou_metade", async () => {
    const { uc } = setup();
    await withSchedule(uc, "fixed", WEEKDAYS_9_TO_6, { halfDayMinutes: 270 });
    const r = await uc.theoretical(ORG, "e1", "2026-10-08", "2026-10-09", ["2026-10-09"]);
    expect(r.days.map((d) => d.minutes)).toEqual([480, 270]);
    const { uc: uc2 } = setup();
    await withSchedule(uc2, "flexible", { "5": 480 });
    expect((await uc2.theoretical(ORG, "e1", "2026-10-09", "2026-10-09", ["2026-10-09"])).days[0]!.minutes).toBe(240);
  });

  test("modo contrato (C3.10): horas semanais ÷ dias de trabalho; turno noturno passa a meia-noite", async () => {
    const { uc } = setup({ mode: "contract", contractMinutes: 40 * 60 });
    await withSchedule(uc, "fixed", WEEKDAYS_9_TO_6);
    expect((await uc.theoretical(ORG, "e1", "2026-10-09", "2026-10-09")).days[0]).toMatchObject({ minutes: 480, reason: "contract" });
    const { uc: night } = setup();
    await withSchedule(night, "fixed", { "5": [{ start: "22:00", end: "06:00" }] }, { night: true });
    expect((await night.theoretical(ORG, "e1", "2026-10-09", "2026-10-09")).days[0]!.minutes).toBe(480);
    await expect(night.createSchedule(ORG, A, { name: "Sem noturno", kind: "fixed", firstVersion: V({ "5": [{ start: "22:00", end: "06:00" }] }) })).rejects.toThrow("horário noturno");
  });

  test("sem horário atribuído → 0 com motivo, nunca um valor inventado", async () => {
    const { uc } = setup();
    expect((await uc.theoretical(ORG, "e1", "2026-10-09", "2026-10-09")).days[0]).toMatchObject({ minutes: 0, reason: "no_schedule" });
  });
});

describe("Dia de trabalho no fuso do centro (TK-12)", () => {
  test("TK_12_dia_local_e_duracao_real_em_lisboa_e_madrid_nos_dias_de_mudanca_de_hora", () => {
    // 25/10/2026: fim da hora de verão (PT e ES) → 25 h; 29/03/2026: início → 23 h.
    expect(dayBoundsUtc("2026-10-25", "Europe/Lisbon").minutes).toBe(25 * 60);
    expect(dayBoundsUtc("2026-10-25", "Europe/Madrid").minutes).toBe(25 * 60);
    expect(dayBoundsUtc("2026-03-29", "Europe/Lisbon").minutes).toBe(23 * 60);
    expect(dayBoundsUtc("2026-03-29", "Europe/Madrid").minutes).toBe(23 * 60);
    expect(dayBoundsUtc("2026-10-26", "Europe/Lisbon").minutes).toBe(24 * 60);
    // O mesmo instante pertence a dias diferentes em Lisboa e Madrid.
    expect(localDateOf("2026-10-25T23:30:00Z", "Europe/Lisbon")).toBe("2026-10-25");
    expect(localDateOf("2026-10-25T23:30:00Z", "Europe/Madrid")).toBe("2026-10-26");
    // Início do dia local em UTC muda com o horário de verão.
    expect(dayBoundsUtc("2026-10-25", "Europe/Madrid").startUtc).toBe("2026-10-24T22:00:00.000Z");
    expect(dayBoundsUtc("2026-10-26", "Europe/Madrid").startUtc).toBe("2026-10-25T23:00:00.000Z");
    expect(localTimeToUtc("2026-10-25", "09:00", "Europe/Lisbon")).toBe("2026-10-25T09:00:00.000Z");
    expect(localTimeToUtc("2026-10-24", "09:00", "Europe/Lisbon")).toBe("2026-10-24T08:00:00.000Z");
  });
});

describe("Horários, calendários e eliminação", () => {
  test("CF_13_dois_horarios_com_o_mesmo_nome_sao_recusados", async () => {
    const { uc } = setup();
    await uc.createSchedule(ORG, A, { name: "Loja Manhã", kind: "flexible", firstVersion: V({ "1": 480 }) });
    const err = await uc.createSchedule(ORG, A, { name: " loja manhã ", kind: "fixed", firstVersion: V(WEEKDAYS_9_TO_6) }).catch((e) => e);
    expect(err).toBeInstanceOf(TimeConflictError);
    expect(err).toMatchObject({ code: "duplicate_name" });
  });

  test("CF_10_importacao_fica_a_confirmar_e_nao_substitui_regionais", async () => {
    const { uc, repo } = setup();
    const cal = await uc.createHolidayCalendar(ORG, A, { name: "Porto", country: "PT", compensationCoefficient: 1, approvalRequired: false, accruedExpires: false, halfDayCompensation: false });
    await uc.addHoliday(ORG, A, cal.id, { date: "2026-12-25", name: "Natal (confirmado à mão)", kind: "regional", status: "confirmed", coefficient: 2, source: "manual" });
    const r = await uc.importNational(ORG, A, cal.id, 2026);
    expect(r).toMatchObject({ added: 2, skipped: 1 });
    const natal = repo.hdays.find((d) => d.date === "2026-12-25")!;
    expect(natal).toMatchObject({ name: "Natal (confirmado à mão)", kind: "regional", status: "confirmed", coefficient: 2 });
    expect(repo.hdays.filter((d) => d.kind === "national").every((d) => d.status === "to_confirm")).toBe(true);
    expect((await uc.importNational(ORG, A, cal.id, 2026)).added).toBe(0); // repetir não duplica
    const es = await uc.createHolidayCalendar(ORG, A, { name: "Oviedo", country: "ES", compensationCoefficient: 1, approvalRequired: false, accruedExpires: false, halfDayCompensation: false });
    await expect(uc.importNational(ORG, A, es.id, 2026)).rejects.toThrow("fonte oficial");
  });

  test("RE_35_apagar_calendario_mostra_dias_e_funcionarios_afetados_e_exige_confirmacao", async () => {
    const { uc, repo, events } = setup();
    const cal = await uc.createHolidayCalendar(ORG, A, { name: "Porto", country: "PT", compensationCoefficient: 1, approvalRequired: false, accruedExpires: false, halfDayCompensation: false });
    await uc.importNational(ORG, A, cal.id, 2026);
    await uc.assign(ORG, A, { resourceType: "holiday_calendar", resourceId: cal.id, targetType: "location", targetId: "loc-porto", validFrom: "2026-01-01", validTo: null });
    const preview = await uc.deletePreview(ORG, "holiday_calendar", cal.id);
    expect(preview).toEqual({ name: "Porto", days: 3, employees: 4, assignments: 1 });
    const err = await uc.deleteCalendar(ORG, A, "holiday_calendar", cal.id, "porto?").catch((e) => e);
    expect(err).toMatchObject({ code: "confirmation_required", details: { preview } });
    await uc.deleteCalendar(ORG, A, "holiday_calendar", cal.id, "Porto");
    expect(await uc.listHolidayCalendars(ORG)).toEqual([]);
    expect(repo.assignments[0]!.validTo).toBe("2026-10-11");
    expect(events).toContain("time.holiday_calendar.delete");
  });

  test("calendário de férias: sem limite por omissão, validações e nome único", async () => {
    const { uc } = setup();
    const base: Omit<VacationCalendar, "id"> = { name: "Férias PT", unit: "days", counting: "working", limited: true, maxAmount: null, renewal: "calendar_year", renewalStart: null, seniorityRules: [], cumulative: false, halfDay: true, allowNegative: false, minConsecutive: null, maxConsecutive: null, advanceMonths: null, blockedDates: [] };
    const v = await uc.createVacationCalendar(ORG, A, base);
    expect(v.maxAmount).toBeNull();
    await expect(uc.createVacationCalendar(ORG, A, { ...base, name: "férias pt" })).rejects.toMatchObject({ code: "duplicate_name" });
    await expect(uc.createVacationCalendar(ORG, A, { ...base, name: "X", renewal: "custom" })).rejects.toBeInstanceOf(TimeValidationError);
    await expect(uc.createVacationCalendar(ORG, A, { ...base, name: "Y", minConsecutive: 5, maxConsecutive: 2 })).rejects.toThrow("máximo");
  });

  test("atribuição: prioridade pessoal > centro e sem sobreposição", async () => {
    const { uc } = setup();
    const loja = await withSchedule(uc, "flexible", { "5": 480 });
    const pessoal = await uc.createSchedule(ORG, A, { name: "Pessoal", kind: "flexible", firstVersion: V({ "5": 300 }) });
    await uc.assign(ORG, A, { resourceType: "schedule", resourceId: pessoal.id, targetType: "employee", targetId: "e1", validFrom: "2026-10-01", validTo: null });
    expect((await uc.theoretical(ORG, "e1", "2026-10-09", "2026-10-09")).days[0]).toMatchObject({ minutes: 300, scheduleName: "Pessoal" });
    expect((await uc.theoretical(ORG, "e1", "2026-09-25", "2026-09-25")).days[0]!.scheduleName).toBe(loja.name);
    await expect(uc.assign(ORG, A, { resourceType: "schedule", resourceId: pessoal.id, targetType: "employee", targetId: "e1", validFrom: "2026-12-01", validTo: null })).rejects.toMatchObject({ code: "assignment_overlap" });
  });
});
