import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { RostersUseCases } from "../../application/use-cases/rosters.use-cases.js";
import { evaluate } from "../../domain/services/constraints.js";
import { RosterBlockedError, RosterConflictError, RosterForbiddenError, RosterValidationError } from "../../domain/errors.js";
import { FakePublishedHook, FakeRostersAudit, FakeRostersContext, FakeRostersNotifier, FakeRostersRepository, NO_RULES } from "../fakes/fake-rosters.js";

const ORG = mintOrganizationId("org-a");
const BOSS = { userId: "u-boss", email: "gestora@demo.invalid" };
const E1 = { userId: "u-e1", email: "e1@demo.invalid" };
const E2 = { userId: "u-e2", email: "e2@demo.invalid" };

function setup() {
  const repo = new FakeRostersRepository();
  const ctx = new FakeRostersContext();
  const notifier = new FakeRostersNotifier();
  const hook = new FakePublishedHook();
  const audit = new FakeRostersAudit();
  const uc = new RostersUseCases(repo, ctx, notifier, hook, audit);
  return { repo, ctx, notifier, hook, audit, uc };
}

async function rosterWithTemplates(uc: RostersUseCases) {
  const roster = await uc.createRoster(ORG, BOSS, { name: "Loja Porto", targetType: "location", targetId: "11111111-1111-4111-8111-111111111111" });
  const tarde = await uc.createTemplate(ORG, BOSS, { name: "Tarde", abbreviation: "T", color: null, onCall: false, segments: [{ start: "16:00", end: "22:00" }] });
  const noite = await uc.createTemplate(ORG, BOSS, { name: "Noturno", abbreviation: "N", color: null, onCall: false, segments: [{ start: "22:00", end: "04:00" }] });
  const manha = await uc.createTemplate(ORG, BOSS, { name: "Manhã", abbreviation: "M", color: null, onCall: false, segments: [{ start: "08:00", end: "16:00" }] });
  return { roster, tarde, noite, manha };
}

const shift = (employeeId: string, workDate: string, templateId: string) => ({ employeeId, workDate, kind: "shift" as const, templateId, segments: [] });

describe("Escalas — motor de restrições (domínio)", () => {
  const s = (workDate: string, start: string, end: string, employeeId = "e1") => ({ employeeId, workDate, kind: "shift" as const, segments: [{ start, end }], templateId: null, onCall: false });

  test("RE_16_descanso_de_12h_entre_16_22_e_22_04_e_violado", () => {
    const v = evaluate([s("2026-10-19", "16:00", "22:00"), s("2026-10-19", "22:00", "04:00"), s("2026-10-20", "08:00", "16:00")], { ...NO_RULES, minRestMinutes: 720, restSeverity: "block" }, new Map());
    expect(v.map((x) => [x.rule, x.severity, x.workDate])).toEqual([["min_rest", "block", "2026-10-20"]]);
  });

  test("sobreposição bloqueia sempre; máximos só com valor (D6)", () => {
    const shifts = [s("2026-10-19", "08:00", "16:00"), s("2026-10-19", "15:00", "20:00")];
    expect(evaluate(shifts, NO_RULES, new Map()).map((x) => [x.rule, x.severity])).toEqual([["overlap", "block"]]);
    const long = [s("2026-10-19", "08:00", "20:00")];
    expect(evaluate(long, NO_RULES, new Map())).toEqual([]);
    expect(evaluate(long, { ...NO_RULES, maxDailyMinutes: 600 }, new Map())[0]).toMatchObject({ rule: "max_daily", severity: "warning" });
    const week = ["19", "20", "21", "22", "23", "24"].map((d) => s(`2026-10-${d}`, "08:00", "16:00"));
    expect(evaluate(week, { ...NO_RULES, maxWeeklyMinutes: 40 * 60 }, new Map()).every((x) => x.rule === "max_weekly")).toBe(true);
  });
});

describe("Escalas — casos de uso", () => {
  test("RE_15_modelo_sem_nome_ou_abreviatura_campo_obrigatorio", async () => {
    const { uc } = setup();
    await expect(uc.createTemplate(ORG, BOSS, { name: "", abbreviation: "T", color: null, onCall: false, segments: [{ start: "16:00", end: "22:00" }] })).rejects.toMatchObject({ message: "Campo obrigatório", field: "name" });
    await expect(uc.createTemplate(ORG, BOSS, { name: "Tarde", abbreviation: " ", color: null, onCall: false, segments: [{ start: "16:00", end: "22:00" }] })).rejects.toMatchObject({ message: "Campo obrigatório", field: "abbreviation" });
  });

  test("RE_16_bloqueio_recusa_publicar_e_aviso_exige_confirmacao", async () => {
    const { uc, ctx, repo } = setup();
    const { roster, tarde, noite } = await rosterWithTemplates(uc);
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", tarde.id));
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-20", noite.id));
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-21", tarde.id));
    ctx.rules_ = { ...NO_RULES, minRestMinutes: 12 * 60, restSeverity: "block" };
    // 2026-10-20 22:00–04:00 → 21 às 16:00 = 12h (ok); 19 às 22:00 → 20 às 22:00 (ok). Força o conflito:
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-22", tarde.id));
    await uc.addShift(ORG, BOSS, roster.id, { employeeId: "e1", workDate: "2026-10-23", kind: "shift", templateId: null, segments: [{ start: "06:00", end: "12:00" }] });
    await expect(uc.publish(ORG, BOSS, roster.id, { reason: null, confirm: true })).rejects.toBeInstanceOf(RosterBlockedError);
    expect(repo.publications).toEqual([]);
    ctx.rules_ = { ...ctx.rules_, restSeverity: "warning" };
    const err = await uc.publish(ORG, BOSS, roster.id, { reason: null, confirm: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RosterConflictError);
    expect((err as RosterConflictError).violations.map((v) => v.workDate)).toEqual(["2026-10-23"]);
    const p = await uc.publish(ORG, BOSS, roster.id, { reason: null, confirm: true });
    expect(p.confirmedWarnings).toHaveLength(1);
  });

  test("RE_17_publicar_notifica_os_afetados_e_a_versao_anterior_fica_no_historico", async () => {
    const { uc, notifier, repo, hook } = setup();
    const { roster, manha, tarde } = await rosterWithTemplates(uc);
    const { shift: s1 } = await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", manha.id));
    await uc.addShift(ORG, BOSS, roster.id, shift("e2", "2026-10-19", tarde.id));
    const v1 = await uc.publish(ORG, BOSS, roster.id, { reason: null, confirm: false });
    expect(v1.version).toBe(1);
    expect(notifier.sent.at(-1)).toEqual({ userIds: ["u-e1", "u-e2"], title: "Escala publicada" });
    expect(hook.calls.at(-1)).toEqual([{ employeeId: "e1", workDate: "2026-10-19" }, { employeeId: "e2", workDate: "2026-10-19" }]);
    await expect(uc.publish(ORG, BOSS, roster.id, { reason: null, confirm: false })).rejects.toMatchObject({ code: "nothing_to_publish" });
    // Novo turno em rascunho não conta até publicar.
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-20", manha.id));
    expect([...(await uc.plannedFor(ORG, "e1", "2026-10-19", "2026-10-20")).keys()]).toEqual(["2026-10-19"]);
    const v2 = await uc.publish(ORG, BOSS, roster.id, { reason: "Semana seguinte", confirm: false });
    expect(v2.version).toBe(2);
    const history = await uc.history(ORG, roster.id);
    expect(history.map((h) => h.version)).toEqual([2, 1]);
    expect(history[1]!.changes.find((c) => c.shiftId === s1.id)?.after).toMatchObject({ employeeId: "e1", workDate: "2026-10-19" });
    expect(repo.publications).toHaveLength(2);
  });

  test("RE_18_turno_em_dia_de_ferias_aprovadas_avisa_ou_bloqueia", async () => {
    const { uc, ctx } = setup();
    const { roster, manha } = await rosterWithTemplates(uc);
    ctx.absences.set("e1", ["2026-10-19"]);
    const { warnings } = await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", manha.id));
    expect(warnings).toEqual([expect.objectContaining({ rule: "absence", severity: "warning", workDate: "2026-10-19" })]);
    ctx.rules_ = { ...NO_RULES, absenceSeverity: "block" };
    await expect(uc.publish(ORG, BOSS, roster.id, { reason: null, confirm: true })).rejects.toBeInstanceOf(RosterBlockedError);
  });

  test("TK_16_alterar_turno_publicado_exige_motivo_cria_versao_e_notifica", async () => {
    const { uc, notifier, audit } = setup();
    const { roster, manha, tarde } = await rosterWithTemplates(uc);
    const { shift: s } = await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", manha.id));
    await uc.publish(ORG, BOSS, roster.id, { reason: null, confirm: false });
    await expect(uc.updateShift(ORG, BOSS, s.id, { templateId: tarde.id }, { reason: null, confirm: false })).rejects.toBeInstanceOf(RosterValidationError);
    const r = await uc.updateShift(ORG, BOSS, s.id, { templateId: tarde.id }, { reason: "Troca de horário a pedido da loja", confirm: false });
    expect(r.publication).toMatchObject({ version: 2, reason: "Troca de horário a pedido da loja" });
    expect(r.publication!.changes[0]!.before?.segments).toEqual([{ start: "08:00", end: "16:00" }]);
    expect(r.publication!.changes[0]!.after?.segments).toEqual([{ start: "16:00", end: "22:00" }]);
    expect(notifier.sent.at(-1)).toEqual({ userIds: ["u-e1"], title: "Turno alterado: Troca de horário a pedido da loja" });
    expect(audit.actions).toContainEqual({ action: "rosters.shift.change_published", reason: "Troca de horário a pedido da loja" });
    // Retirar um turno publicado também exige motivo e publica.
    await expect(uc.deleteShift(ORG, BOSS, s.id, { reason: "", confirm: false })).rejects.toMatchObject({ field: "reason" });
    const d = await uc.deleteShift(ORG, BOSS, s.id, { reason: "Loja fechada", confirm: false });
    expect(d.publication?.changes[0]?.after).toBeNull();
    expect((await uc.plannedFor(ORG, "e1", "2026-10-19", "2026-10-19")).size).toBe(0);
  });

  test("atribuição em massa respeita os dias da semana", async () => {
    const { uc } = setup();
    const { roster, manha } = await rosterWithTemplates(uc);
    const r = await uc.assignBulk(ORG, BOSS, roster.id, { employeeIds: ["e1", "e2"], from: "2026-10-19", to: "2026-10-25", weekdays: ["1", "2", "3", "4", "5"], kind: "shift", templateId: manha.id });
    expect(r.created).toBe(10);
    await uc.publish(ORG, BOSS, roster.id, { reason: null, confirm: false });
    const planned = await uc.plannedFor(ORG, "e1", "2026-10-19", "2026-10-25");
    expect([...planned.values()].map((p) => p.minutes)).toEqual([480, 480, 480, 480, 480]);
  });

  test("plano: noturno e folga", async () => {
    const { uc } = setup();
    const { roster, noite } = await rosterWithTemplates(uc);
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", noite.id));
    await uc.addShift(ORG, BOSS, roster.id, { employeeId: "e1", workDate: "2026-10-20", kind: "day_off", templateId: null, segments: [] });
    await uc.publish(ORG, BOSS, roster.id, { reason: null, confirm: false });
    const p = await uc.plannedFor(ORG, "e1", "2026-10-19", "2026-10-20");
    expect(p.get("2026-10-19")).toMatchObject({ minutes: 360, night: true, dayOff: false });
    expect(p.get("2026-10-20")).toMatchObject({ minutes: 0, dayOff: true });
  });

  test("troca de turno: o colega aceita, a gestão aprova e fica publicada", async () => {
    const { uc, repo } = setup();
    const { roster, manha, tarde } = await rosterWithTemplates(uc);
    const { shift: a } = await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", manha.id));
    const { shift: b } = await uc.addShift(ORG, BOSS, roster.id, shift("e2", "2026-10-19", tarde.id));
    await uc.publish(ORG, BOSS, roster.id, { reason: null, confirm: false });
    const swap = await uc.requestSwap(ORG, E1, { shiftId: a.id, targetEmployeeId: "e2", counterShiftId: b.id, comment: "Consulta de manhã" });
    await expect(uc.decideSwap(ORG, BOSS, swap.id, true, null, false)).rejects.toMatchObject({ code: "invalid_state" });
    await expect(uc.respondSwap(ORG, BOSS, swap.id, true)).rejects.toBeInstanceOf(RosterForbiddenError);
    await uc.respondSwap(ORG, E2, swap.id, true);
    await expect(uc.decideSwap(ORG, E2, swap.id, true, null, false)).rejects.toBeInstanceOf(RosterForbiddenError);
    await expect(uc.decideSwap(ORG, BOSS, swap.id, false, null, false)).rejects.toMatchObject({ field: "comment" });
    expect((await uc.decideSwap(ORG, BOSS, swap.id, true, null, false))?.status).toBe("approved");
    expect(repo.shifts.find((s) => s.id === a.id)?.published?.employeeId).toBe("e2");
    expect(repo.shifts.find((s) => s.id === b.id)?.published?.employeeId).toBe("e1");
    expect((await uc.myRoster(ORG, E1, "2026-10-19", "2026-10-19")).shifts.map((s) => s.segments[0]!.start)).toEqual(["16:00"]);
  });

  test("duas publicações ao mesmo tempo: a segunda é recusada", async () => {
    const { uc, repo } = setup();
    const { roster, manha } = await rosterWithTemplates(uc);
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", manha.id));
    repo.rosters[0]!.version = 5; // outra pessoa publicou entretanto
    const stale = { ...roster };
    await expect(repo.bumpVersion(ORG, stale.id, stale.version)).resolves.toBe(false);
  });
});

describe("Escalas — sobreposição bloqueia já no rascunho", () => {
  test("o mesmo colaborador não fica com dois turnos à mesma hora (nem noutra escala); turnos seguidos e folgas passam", async () => {
    const { uc } = setup();
    const { roster, tarde, manha, noite } = await rosterWithTemplates(uc);
    const other = await uc.createRoster(ORG, BOSS, { name: "Loja Braga", targetType: "location", targetId: "22222222-2222-4222-8222-222222222222" });
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", manha.id));
    const err = await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", manha.id)).catch((e) => e);
    expect(err).toBeInstanceOf(RosterBlockedError);
    expect(err.violations[0]).toMatchObject({ rule: "overlap", severity: "block", employeeId: "e1", workDate: "2026-10-19" });
    await expect(uc.addShift(ORG, BOSS, other.id, shift("e1", "2026-10-19", manha.id))).rejects.toBeInstanceOf(RosterBlockedError);
    // 08–16 seguido de 16–22 não se sobrepõe; noturno de véspera (22–04) também não toca nas 08h.
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", tarde.id));
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-18", noite.id));
    await uc.addShift(ORG, BOSS, roster.id, { employeeId: "e1", workDate: "2026-10-19", kind: "day_off", templateId: null, segments: [] });
    // Outro colaborador à mesma hora: sem problema.
    await uc.addShift(ORG, BOSS, roster.id, shift("e2", "2026-10-19", manha.id));
  });

  test("alterar para um horário sobreposto é recusado; a si próprio não conta", async () => {
    const { uc } = setup();
    const { roster, tarde, manha } = await rosterWithTemplates(uc);
    const a = await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-20", manha.id));
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-20", tarde.id));
    await uc.updateShift(ORG, BOSS, a.shift.id, { templateId: manha.id }, { reason: null, confirm: false });
    await expect(uc.updateShift(ORG, BOSS, a.shift.id, { templateId: tarde.id }, { reason: null, confirm: false })).rejects.toBeInstanceOf(RosterBlockedError);
  });

  test("atribuição em massa recusa se sobrepõe ao que já existe", async () => {
    const { uc } = setup();
    const { roster, manha } = await rosterWithTemplates(uc);
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-21", manha.id));
    await expect(uc.assignBulk(ORG, BOSS, roster.id, { employeeIds: ["e1"], from: "2026-10-20", to: "2026-10-22", weekdays: [], kind: "shift", templateId: manha.id })).rejects.toBeInstanceOf(RosterBlockedError);
  });

  test("resumo (visão macro): pessoas no período, por publicar e última publicação", async () => {
    const { uc } = setup();
    const { roster, manha } = await rosterWithTemplates(uc);
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", manha.id));
    await uc.addShift(ORG, BOSS, roster.id, shift("e2", "2026-10-19", manha.id));
    const [row] = await uc.summary(ORG, "2026-10-19", "2026-10-25");
    expect(row).toMatchObject({ roster: { id: roster.id }, shifts: 2, pending: 2, lastPublishedAt: null });
    expect(row!.employeeIds.sort()).toEqual(["e1", "e2"]);
    await expect(uc.summary(ORG, "2026-10-25", "2026-10-19")).rejects.toBeInstanceOf(RosterValidationError);
  });
});

describe("Escalas — limpar pendentes da semana e repor (desfazer)", () => {
  test("limpa só os pendentes do colaborador, desta escala e período; publicados ficam; repor devolve-os", async () => {
    const { uc, repo } = setup();
    const { roster, manha, tarde } = await rosterWithTemplates(uc);
    const other = await uc.createRoster(ORG, BOSS, { name: "Loja Braga", targetType: "location", targetId: "22222222-2222-4222-8222-222222222222" });
    const published = await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", manha.id));
    await uc.publish(ORG, BOSS, roster.id, { reason: null, confirm: true });
    const a = await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-20", manha.id));
    const b = await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-21", tarde.id));
    const nextWeek = await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-27", manha.id));
    const otherEmployee = await uc.addShift(ORG, BOSS, roster.id, shift("e2", "2026-10-20", manha.id));
    const otherRoster = await uc.addShift(ORG, BOSS, other.id, shift("e1", "2026-10-22", manha.id));

    const { removed } = await uc.clearPending(ORG, BOSS, roster.id, { employeeId: "e1", from: "2026-10-19", to: "2026-10-25" });
    expect(removed.map((s) => s.id).sort()).toEqual([a.shift.id, b.shift.id].sort());
    const alive = (id: string) => !repo.shifts.find((s) => s.id === id)!.deleted;
    expect([published.shift.id, nextWeek.shift.id, otherEmployee.shift.id, otherRoster.shift.id].every(alive)).toBe(true);

    const { restored } = await uc.restoreShifts(ORG, BOSS, roster.id, removed.map((s) => s.id));
    expect(restored).toHaveLength(2);
    expect([a.shift.id, b.shift.id].every(alive)).toBe(true);
    // Refazer só com os mesmos ids.
    expect((await uc.clearPending(ORG, BOSS, roster.id, { employeeId: "e1", from: "2026-10-19", to: "2026-10-25", shiftIds: [a.shift.id] })).removed.map((s) => s.id)).toEqual([a.shift.id]);
  });

  test("repor um turno que agora se sobrepõe a outro é recusado; período inválido é 400", async () => {
    const { uc } = setup();
    const { roster, manha } = await rosterWithTemplates(uc);
    const a = await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-20", manha.id));
    await uc.deleteShift(ORG, BOSS, a.shift.id, { reason: null, confirm: false });
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-20", manha.id));
    await expect(uc.restoreShifts(ORG, BOSS, roster.id, [a.shift.id])).rejects.toBeInstanceOf(RosterBlockedError);
    await expect(uc.clearPending(ORG, BOSS, roster.id, { employeeId: "e1", from: "2026-10-25", to: "2026-10-19" })).rejects.toBeInstanceOf(RosterValidationError);
  });
});

describe("Escalas — lote e disponibilidade (Assistente Mezza)", () => {
  test("addShifts: vários horários numa operação; sobreposição recusa o lote inteiro; um registo de auditoria", async () => {
    const { uc, repo, audit } = setup();
    const { roster, manha } = await rosterWithTemplates(uc);
    const r = await uc.addShifts(ORG, BOSS, roster.id, [shift("e1", "2026-10-19", manha.id), { employeeId: "e2", workDate: "2026-10-19", kind: "shift", templateId: null, segments: [{ start: "12:00", end: "20:00" }] }], "AI_AGENT");
    expect(r.created.map((s) => [s.employeeId, s.segments[0]!.start])).toEqual([["e1", "08:00"], ["e2", "12:00"]]);
    expect(audit.actions.filter((e) => e.action === "rosters.shift.batch")).toHaveLength(1);
    const before = repo.shifts.length;
    await expect(uc.addShifts(ORG, BOSS, roster.id, [shift("e3", "2026-10-20", manha.id), { employeeId: "e1", workDate: "2026-10-19", kind: "shift", templateId: null, segments: [{ start: "10:00", end: "12:00" }] }])).rejects.toBeInstanceOf(RosterBlockedError);
    expect(repo.shifts.length).toBe(before);
  });

  test("availability: sobreposição bloqueia; ausência e descanso conforme as regras; não grava nada", async () => {
    const { uc, repo, ctx } = setup();
    const { roster, manha } = await rosterWithTemplates(uc);
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", manha.id));
    ctx.absences.set("e2", ["2026-10-19"]);
    const before = repo.shifts.length;
    const a = await uc.availability(ORG, roster.id, { workDate: "2026-10-19", segments: [{ start: "14:00", end: "20:00" }], employeeIds: ["e1", "e2", "e3"] });
    expect(a.map((x) => [x.employeeId, x.status])).toEqual([
      ["e1", "blocked"],
      ["e2", "warning"],
      ["e3", "available"],
    ]);
    expect(a[0]!.reasons[0]!.rule).toBe("overlap");
    expect(repo.shifts.length).toBe(before);
  });
});

describe("Portal — colegas do turno (Novo RH)", () => {
  test("só com a regra ligada; mesma escala, horário sobreposto (inclui noturno do dia vizinho); só nome curto, cargo e horário", async () => {
    const { uc, ctx, repo } = setup();
    const { roster, tarde, noite, manha } = await rosterWithTemplates(uc);
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", noite.id)); // 22:00–04:00
    await uc.addShift(ORG, BOSS, roster.id, shift("e2", "2026-10-19", tarde.id)); // 16:00–22:00: encosta, não sobrepõe
    await uc.addShift(ORG, BOSS, roster.id, { employeeId: "e3", workDate: "2026-10-20", kind: "shift", templateId: null, segments: [{ start: "02:00", end: "06:00" }] }); // dia seguinte, sobrepõe
    await uc.addShift(ORG, BOSS, roster.id, shift("e4", "2026-10-19", noite.id)); // mesmo turno
    await uc.addShift(ORG, BOSS, roster.id, shift("e5", "2026-10-20", manha.id)); // 08:00–16:00: não sobrepõe
    await uc.addShift(ORG, BOSS, roster.id, shift("e6", "2026-10-19", noite.id)); // inativo → não aparece
    await uc.publish(ORG, BOSS, roster.id, { reason: null, confirm: true });
    ctx.people = [
      { id: "e2", fullName: "Rui Faria", positionName: "Cozinha", active: true },
      { id: "e3", fullName: "ana delgado castro", positionName: "Sala", active: true },
      { id: "e4", fullName: "Eva Sousa", positionName: null, active: true },
      { id: "e5", fullName: "João Lima", positionName: "Sala", active: true },
      { id: "e6", fullName: "Ex Colega", positionName: null, active: false },
    ];
    const mine = (await repo.listShifts(ORG, { employeeIds: ["e1"], from: "2026-10-19", to: "2026-10-19" }))[0]!;
    // Desligado por omissão (ADR-0030): o servidor recusa.
    await expect(uc.myShiftCoworkers(ORG, E1, mine.id)).rejects.toBeInstanceOf(RosterForbiddenError);
    ctx.coworkersOn = true;
    const { coworkers } = await uc.myShiftCoworkers(ORG, E1, mine.id);
    expect(coworkers).toEqual([
      { shortName: "Eva Sousa", positionName: null, hours: "22:00–04:00" },
      { shortName: "Ana Castro", positionName: "Sala", hours: "02:00–06:00" },
    ]);
    expect(JSON.stringify(coworkers)).not.toMatch(/e3|e4/);
    // O turno de outra pessoa não se abre por aqui.
    const other = (await repo.listShifts(ORG, { employeeIds: ["e2"], from: "2026-10-19", to: "2026-10-19" }))[0]!;
    await expect(uc.myShiftCoworkers(ORG, E1, other.id)).rejects.toThrow("Turno não encontrado");
  });
});

describe("Cor do modelo de turno", () => {
  test("muda só a cor (validada), fica na lista e vai para a auditoria; null = automática", async () => {
    const { uc } = setup();
    const { tarde } = await rosterWithTemplates(uc);
    const out = await uc.setTemplateColor(ORG, BOSS, tarde.id, "#96BAE4");
    expect(out).toMatchObject({ id: tarde.id, color: "#96BAE4", segments: tarde.segments });
    expect((await uc.listTemplates(ORG)).find((t) => t.id === tarde.id)?.color).toBe("#96BAE4");
    await expect(uc.setTemplateColor(ORG, BOSS, tarde.id, "azul")).rejects.toThrow("Cor inválida");
    expect((await uc.setTemplateColor(ORG, BOSS, tarde.id, null)).color).toBeNull();
    await expect(uc.setTemplateColor(ORG, BOSS, "nao-existe", "#96BAE4")).rejects.toThrow("Modelo não encontrado");
  });
});

describe("Editar modelo de turno (V2)", () => {
  const input = (over: Partial<{ name: string; abbreviation: string; color: string | null; segments: { start: string; end: string }[] }> = {}) => ({
    name: "Tarde",
    abbreviation: "T",
    color: null,
    onCall: false,
    segments: [{ start: "16:00", end: "22:00" }],
    ...over,
  });

  test("nunca usado: altera no lugar (mesmo id) e audita", async () => {
    const { uc, audit } = setup();
    const { tarde } = await rosterWithTemplates(uc);
    const out = await uc.updateTemplate(ORG, BOSS, tarde.id, input({ name: " Tarde longa ", segments: [{ start: "15:00", end: "23:00" }] }));
    expect(out.versioned).toBe(false);
    expect(out.template).toMatchObject({ id: tarde.id, name: "Tarde longa", segments: [{ start: "15:00", end: "23:00" }] });
    expect((await uc.listTemplatesWithUsage(ORG)).find((t) => t.id === tarde.id)).toMatchObject({ used: false, archived: false });
    expect(audit.actions.map((e) => e.action)).toContain("rosters.template.update");
  });

  test("usado (rascunho ou publicado): nova versão; os turnos existentes ficam no modelo antigo", async () => {
    const { uc, repo } = setup();
    const { roster, tarde } = await rosterWithTemplates(uc);
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", tarde.id));
    expect((await uc.listTemplatesWithUsage(ORG)).find((t) => t.id === tarde.id)?.used).toBe(true);
    const out = await uc.updateTemplate(ORG, BOSS, tarde.id, input({ segments: [{ start: "17:00", end: "23:00" }], color: "#96BAE4" }));
    expect(out.versioned).toBe(true);
    expect(out.template.id).not.toBe(tarde.id);
    expect(out.template).toMatchObject({ name: "Tarde", color: "#96BAE4", segments: [{ start: "17:00", end: "23:00" }], archived: false });
    // O antigo fica arquivado e o turno já feito mantém-no, com o horário de antes.
    expect(repo.templates.find((t) => t.id === tarde.id)?.archived).toBe(true);
    const existing = repo.shifts.find((s) => s.employeeId === "e1" && s.workDate === "2026-10-19")!;
    expect(existing).toMatchObject({ templateId: tarde.id, segments: [{ start: "16:00", end: "22:00" }] });
    // Atribuições novas usam o novo; o antigo já não se atribui.
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-20", out.template.id));
    expect(repo.shifts.find((s) => s.workDate === "2026-10-20")?.segments).toEqual([{ start: "17:00", end: "23:00" }]);
    await expect(uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-21", tarde.id))).rejects.toThrow("Modelo não encontrado");
  });

  test("nova versão que falha a criar repõe o modelo antigo", async () => {
    const { uc, repo } = setup();
    const { roster, tarde } = await rosterWithTemplates(uc);
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", tarde.id));
    repo.failNextCreate = true;
    await expect(uc.updateTemplate(ORG, BOSS, tarde.id, input({ name: "Tarde B" }))).rejects.toThrow("falha simulada");
    expect(repo.templates.find((t) => t.id === tarde.id)?.archived).toBe(false);
  });

  test("atribuição a meio da edição: desfaz e devolve 409 template_in_use", async () => {
    const { uc, repo } = setup();
    const { roster, tarde } = await rosterWithTemplates(uc);
    // Outro gestor atribui o modelo entre a verificação e a gravação.
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", (await uc.createTemplate(ORG, BOSS, input({ name: "Aux", abbreviation: "A" }))).id));
    const assigned = repo.shifts[repo.shifts.length - 1]!;
    repo.onUpdateTemplate = () => {
      repo.onUpdateTemplate = null;
      repo.shifts.push({ ...assigned, id: "s-concorrente", templateId: tarde.id });
    };
    const err = await uc.updateTemplate(ORG, BOSS, tarde.id, input({ name: "Outra" })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RosterConflictError);
    expect((err as RosterConflictError).code).toBe("template_in_use");
    expect(repo.templates.find((t) => t.id === tarde.id)?.name).toBe("Tarde");
  });

  test("validações: nome duplicado de outro modelo, faixas inválidas, modelo inexistente ou arquivado", async () => {
    const { uc } = setup();
    const { tarde, noite } = await rosterWithTemplates(uc);
    await expect(uc.updateTemplate(ORG, BOSS, tarde.id, input({ name: "noturno" }))).rejects.toMatchObject({ code: "duplicate_name" });
    await expect(uc.updateTemplate(ORG, BOSS, tarde.id, input({ segments: [{ start: "10:00", end: "10:00" }] }))).rejects.toBeInstanceOf(RosterValidationError);
    await expect(uc.updateTemplate(ORG, BOSS, "nao-existe", input())).rejects.toThrow("Modelo não encontrado");
    await uc.archiveTemplate(ORG, BOSS, noite.id);
    await expect(uc.updateTemplate(ORG, BOSS, noite.id, input({ name: "Noturno" }))).rejects.toThrow("Modelo não encontrado");
  });

  test("cor de um modelo já usado fica bloqueada (409 template_in_use)", async () => {
    const { uc } = setup();
    const { roster, tarde } = await rosterWithTemplates(uc);
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-10-19", tarde.id));
    await expect(uc.setTemplateColor(ORG, BOSS, tarde.id, "#96BAE4")).rejects.toMatchObject({ code: "template_in_use" });
  });
});
