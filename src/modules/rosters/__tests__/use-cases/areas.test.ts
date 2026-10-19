import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { RostersUseCases } from "../../application/use-cases/rosters.use-cases.js";
import { sameState, stateOf, type ShiftState } from "../../domain/entities/roster.js";
import { RosterConflictError, RosterValidationError } from "../../domain/errors.js";
import { FakePublishedHook, FakeRostersAudit, FakeRostersContext, FakeRostersNotifier, FakeRostersRepository } from "../fakes/fake-rosters.js";

/** Áreas de Trabalho (Sala, Caixa, Cozinha…) por centro, associadas a cada turno. Dados fictícios. */
const ORG = mintOrganizationId("org-a");
const BOSS = { userId: "u-boss", email: "gestora@demo.invalid" };
const PORTO = "11111111-1111-4111-8111-111111111111";
const BRAGA = "22222222-2222-4222-8222-222222222222";

function setup() {
  const repo = new FakeRostersRepository();
  const audit = new FakeRostersAudit();
  const uc = new RostersUseCases(repo, new FakeRostersContext(), new FakeRostersNotifier(), new FakePublishedHook(), audit);
  return { repo, audit, uc };
}
const shift = (employeeId: string, workDate: string, areaId: string | null = null) => ({ employeeId, workDate, kind: "shift" as const, templateId: null, segments: [{ start: "09:00", end: "17:00" }], areaId });

describe("Áreas de trabalho — gestão por centro", () => {
  test("criar (ordem a seguir), nome obrigatório e único por centro entre as ativas; desativar não apaga; reativar recusa nomes repetidos", async () => {
    const { uc } = setup();
    const sala = await uc.createArea(ORG, BOSS, { locationId: PORTO, name: " Sala " });
    const caixa = await uc.createArea(ORG, BOSS, { locationId: PORTO, name: "Caixa" });
    expect(sala).toMatchObject({ name: "Sala", sortOrder: 0, active: true });
    expect(caixa.sortOrder).toBe(1);
    // O mesmo nome noutro centro é outra área.
    await expect(uc.createArea(ORG, BOSS, { locationId: BRAGA, name: "Sala" })).resolves.toBeTruthy();
    await expect(uc.createArea(ORG, BOSS, { locationId: PORTO, name: "sala" })).rejects.toBeInstanceOf(RosterConflictError);
    await expect(uc.createArea(ORG, BOSS, { locationId: PORTO, name: "  " })).rejects.toBeInstanceOf(RosterValidationError);
    await uc.updateArea(ORG, BOSS, sala.id, { active: false });
    const nova = await uc.createArea(ORG, BOSS, { locationId: PORTO, name: "Sala" });
    await expect(uc.updateArea(ORG, BOSS, sala.id, { active: true })).rejects.toBeInstanceOf(RosterConflictError);
    expect((await uc.listAreas(ORG, PORTO)).map((a) => [a.name, a.active])).toEqual([["Sala", false], ["Caixa", true], ["Sala", true]]);
    await uc.updateArea(ORG, BOSS, caixa.id, { sortOrder: 5, name: "Caixa principal" });
    expect((await uc.listAreas(ORG, PORTO)).find((a) => a.id === caixa.id)).toMatchObject({ name: "Caixa principal", sortOrder: 5 });
    expect(nova.active).toBe(true);
  });
});

describe("Áreas de trabalho — área da atribuição", () => {
  test("turno com área do centro da escala; outra área recusada; folga sem área; turnos antigos ficam «Sem área»", async () => {
    const { uc, repo } = setup();
    const roster = await uc.createRoster(ORG, BOSS, { name: "Centro Porto", targetType: "location", targetId: PORTO });
    const sala = await uc.createArea(ORG, BOSS, { locationId: PORTO, name: "Sala" });
    const bragaBar = await uc.createArea(ORG, BOSS, { locationId: BRAGA, name: "Bar" });
    const a = await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-11-02", sala.id));
    expect(a.shift.areaId).toBe(sala.id);
    await expect(uc.addShift(ORG, BOSS, roster.id, shift("e2", "2026-11-02", bragaBar.id))).rejects.toMatchObject({ field: "areaId" });
    const off = await uc.addShift(ORG, BOSS, roster.id, { employeeId: "e3", workDate: "2026-11-02", kind: "day_off", templateId: null, segments: [], areaId: sala.id });
    expect(off.shift.areaId).toBeNull();
    const legacy = await uc.addShift(ORG, BOSS, roster.id, shift("e4", "2026-11-02"));
    expect(legacy.shift.areaId).toBeNull();
    // Área desativada: não serve para novas atribuições, mas o turno que já a tinha mantém-na.
    await uc.updateArea(ORG, BOSS, sala.id, { active: false });
    await expect(uc.addShift(ORG, BOSS, roster.id, shift("e5", "2026-11-03", sala.id))).rejects.toMatchObject({ field: "areaId" });
    expect(repo.shifts.find((s) => s.id === a.shift.id)!.areaId).toBe(sala.id);
    await expect(uc.updateShift(ORG, BOSS, a.shift.id, { segments: [{ start: "10:00", end: "18:00" }] }, { reason: null, confirm: false })).resolves.toBeTruthy();
    expect(repo.shifts.find((s) => s.id === a.shift.id)!.areaId).toBe(sala.id);
  });

  test("em massa e mudar de área num rascunho; num turno publicado pede motivo e cria versão nova", async () => {
    const { uc, repo } = setup();
    const roster = await uc.createRoster(ORG, BOSS, { name: "Centro Porto", targetType: "location", targetId: PORTO });
    const sala = await uc.createArea(ORG, BOSS, { locationId: PORTO, name: "Sala" });
    const caixa = await uc.createArea(ORG, BOSS, { locationId: PORTO, name: "Caixa" });
    const t = await uc.createTemplate(ORG, BOSS, { name: "Manhã", abbreviation: "M", color: null, onCall: false, segments: [{ start: "08:00", end: "16:00" }] });
    await uc.assignBulk(ORG, BOSS, roster.id, { employeeIds: ["e1", "e2"], from: "2026-11-02", to: "2026-11-03", weekdays: [], kind: "shift", templateId: t.id, areaId: caixa.id });
    expect(repo.shifts.filter((s) => !s.deleted).every((s) => s.areaId === caixa.id)).toBe(true);
    const first = repo.shifts[0]!;
    await uc.updateShift(ORG, BOSS, first.id, { areaId: sala.id }, { reason: null, confirm: false });
    expect(repo.shifts.find((s) => s.id === first.id)!.areaId).toBe(sala.id);
    await uc.publish(ORG, BOSS, roster.id, { reason: null, confirm: true });
    expect(repo.shifts.find((s) => s.id === first.id)!.published).toMatchObject({ areaId: sala.id });
    await expect(uc.updateShift(ORG, BOSS, first.id, { areaId: caixa.id }, { reason: null, confirm: false })).rejects.toMatchObject({ field: "reason" });
    const out = await uc.updateShift(ORG, BOSS, first.id, { areaId: caixa.id }, { reason: "Reforço na caixa", confirm: true });
    expect(out.publication).toMatchObject({ changes: [expect.objectContaining({ before: expect.objectContaining({ areaId: sala.id }), after: expect.objectContaining({ areaId: caixa.id }) })] });
    // Retirar a área (Sem área).
    const second = repo.shifts[1]!;
    const back = await uc.updateShift(ORG, BOSS, second.id, { areaId: null }, { reason: "Sem área", confirm: true });
    expect(back.shift.areaId).toBeNull();
  });

  test("escala de grupo: aceita áreas de qualquer centro (ativas)", async () => {
    const { uc } = setup();
    const roster = await uc.createRoster(ORG, BOSS, { name: "Equipa volante", targetType: "group", targetId: "g1" });
    const bar = await uc.createArea(ORG, BOSS, { locationId: BRAGA, name: "Bar" });
    expect((await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-11-02", bar.id))).shift.areaId).toBe(bar.id);
  });
});

describe("Áreas de trabalho — demonstração", () => {
  test("preenche só turnos sem área (rascunho e publicado), sem nova versão; ignora folgas e áreas de outro centro", async () => {
    const { uc, repo } = setup();
    const roster = await uc.createRoster(ORG, BOSS, { name: "Centro Porto", targetType: "location", targetId: PORTO });
    const sala = await uc.createArea(ORG, BOSS, { locationId: PORTO, name: "Sala" });
    const caixa = await uc.createArea(ORG, BOSS, { locationId: PORTO, name: "Caixa" });
    const bar = await uc.createArea(ORG, BOSS, { locationId: BRAGA, name: "Bar" });
    await uc.addShift(ORG, BOSS, roster.id, shift("e1", "2026-11-02"));
    await uc.addShift(ORG, BOSS, roster.id, shift("e2", "2026-11-02", caixa.id));
    await uc.addShift(ORG, BOSS, roster.id, { employeeId: "e3", workDate: "2026-11-02", kind: "day_off", templateId: null, segments: [], areaId: null });
    await uc.addShift(ORG, BOSS, roster.id, shift("e4", "2026-11-03"));
    await uc.publish(ORG, BOSS, roster.id, { reason: null, confirm: true });
    const version = (await uc.listRosters(ORG)).find((r) => r.id === roster.id)!.version;
    const out = await uc.fillMissingAreasForDemo(ORG, BOSS, roster.id, "2026-11-02", "2026-11-03", (e) => (e === "e4" ? bar.id : sala.id));
    expect(out).toEqual({ filled: 1 });
    const byEmp = (e: string) => repo.shifts.find((s) => s.employeeId === e)!;
    expect(byEmp("e1")).toMatchObject({ areaId: sala.id, published: expect.objectContaining({ areaId: sala.id }), dirty: false });
    expect(byEmp("e2").areaId).toBe(caixa.id);
    expect(byEmp("e3").areaId).toBeNull();
    expect(byEmp("e4").areaId ?? null).toBeNull(); // área de outro centro: recusada
    expect((await uc.listRosters(ORG)).find((r) => r.id === roster.id)!.version).toBe(version);
  });
});

describe("Estado do turno — comparação", () => {
  test("igual mesmo com as chaves noutra ordem (JSONB) e com área ausente = sem área", () => {
    const a: ShiftState = { employeeId: "e1", workDate: "2026-11-02", kind: "shift", segments: [{ start: "09:00", end: "17:00" }], templateId: "t1", onCall: false };
    const fromDb = JSON.parse('{"kind":"shift","onCall":false,"segments":[{"end":"17:00","start":"09:00"}],"workDate":"2026-11-02","employeeId":"e1","templateId":"t1"}') as ShiftState;
    expect(sameState(fromDb, stateOf(a))).toBe(true);
    expect(sameState(stateOf(a), { ...stateOf(a), areaId: "x" })).toBe(false);
    expect(sameState(null, null)).toBe(true);
    expect(sameState(a, null)).toBe(false);
  });
});
