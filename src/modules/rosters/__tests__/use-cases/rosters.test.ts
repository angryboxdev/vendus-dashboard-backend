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
