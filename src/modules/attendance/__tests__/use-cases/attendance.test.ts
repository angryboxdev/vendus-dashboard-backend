import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { AttendanceUseCases } from "../../application/use-cases/attendance.use-cases.js";
import { AttendanceConflictError, AttendanceForbiddenError, AttendanceValidationError, PunchRefusedError } from "../../domain/errors.js";
import { FakeAttendanceRepository, FakeAudit, FakeBackground, FakeClockNow, FakeContext } from "../fakes/fake-attendance.js";

const ORG = mintOrganizationId("org-a");
const EMP = { userId: "u-emp", email: "colaborador@demo.invalid" };
const BOSS = { userId: "u-boss", email: "gestora@demo.invalid" };
const ADMIN = { userId: "u-admin", email: "admin@demo.invalid" };
// Outubro em Lisboa = UTC+1.
const at = (local: string) => new Date(`${local}+01:00`).toISOString();

function setup(now = at("2026-10-12T10:00:00")) {
  const repo = new FakeAttendanceRepository();
  const ctx = new FakeContext();
  const clock = new FakeClockNow(now);
  repo.now = () => clock.value;
  const bg = new FakeBackground();
  const audit = new FakeAudit();
  const uc = new AttendanceUseCases(repo, ctx, audit, clock, bg);
  const event = (local: string, segmentType: "work" | "off" | "break_unpaid" = "work") =>
    repo.events.push({ id: `ev-${repo.events.length + 1}`, employeeId: "e1", occurredAt: at(local), segmentType, source: "web", clientEventId: null, locationId: null, latitude: null, longitude: null, ip: null });
  return { repo, ctx, clock, bg, audit, uc, event };
}

const punch = (segmentType: "work" | "off", extra: Partial<{ clientEventId: string; ip: string; latitude: number; longitude: number }> = {}) => ({
  segmentType,
  source: "web" as const,
  clientEventId: extra.clientEventId ?? null,
  locationId: null,
  latitude: extra.latitude ?? null,
  longitude: extra.longitude ?? null,
  ip: extra.ip ?? null,
});

describe("Assiduidade — casos de uso (Fase 4)", () => {
  test("RE_9_a_mesma_marcacao_enviada_3_vezes_grava_uma_so", async () => {
    const { uc, repo, bg } = setup();
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await uc.punch(ORG, EMP, punch("work", { clientEventId: "offline-1" })));
    await bg.flush();
    expect(repo.events).toHaveLength(1);
    expect(results.map((r) => r.duplicate)).toEqual([false, true, true]);
    expect(results[2]!.event.id).toBe(results[0]!.event.id);
  });

  test("RE_9_fila_offline_guarda_a_hora_do_dispositivo_ate_24h_e_nunca_no_futuro", async () => {
    const { uc, repo } = setup(at("2026-10-12T10:00:00"));
    await uc.punch(ORG, EMP, { ...punch("work", { clientEventId: "o-1" }), source: "pwa", occurredAt: at("2026-10-12T08:00:00") });
    await uc.punch(ORG, EMP, { ...punch("off", { clientEventId: "o-2" }), source: "pwa", occurredAt: at("2026-10-12T09:30:00") });
    expect(repo.events.map((e) => e.occurredAt)).toEqual([at("2026-10-12T08:00:00"), at("2026-10-12T09:30:00")]);
    await expect(uc.punch(ORG, EMP, { ...punch("work"), occurredAt: at("2026-10-12T10:05:00") })).rejects.toMatchObject({ field: "occurredAt" });
    await expect(uc.punch(ORG, EMP, { ...punch("work"), occurredAt: at("2026-10-11T09:00:00") })).rejects.toThrow("pedido de correção");
    // Relógio ligeiramente adiantado (< 2 min) → fica com a hora do servidor.
    await uc.punch(ORG, EMP, { ...punch("work"), occurredAt: at("2026-10-12T10:01:00") });
    expect(repo.events.at(-1)!.occurredAt).toBe(at("2026-10-12T10:00:00"));
  });

  test("marcar o mesmo estado seguido é recusado (ex.: saída sem entrada)", async () => {
    const { uc } = setup();
    await expect(uc.punch(ORG, EMP, punch("off"))).rejects.toBeInstanceOf(AttendanceConflictError);
    await uc.punch(ORG, EMP, punch("work"));
    await expect(uc.punch(ORG, EMP, punch("work"))).rejects.toMatchObject({ code: "same_state" });
  });

  test("conta sem ficha não pode picar", async () => {
    const { uc } = setup();
    await expect(uc.punch(ORG, ADMIN, punch("work"))).rejects.toThrow("não está ligada a uma ficha");
  });

  test("RE_12_bloqueio_por_IP_e_D7_coordenadas_so_se_a_regra_pede", async () => {
    const { uc, ctx, repo } = setup();
    ctx.config_.policy.ipAllowlist = ["10.0.0.1"];
    await expect(uc.punch(ORG, EMP, punch("work", { ip: "10.0.0.2" }))).rejects.toMatchObject({ code: "ip_not_allowed" });
    await expect(uc.punch(ORG, EMP, punch("work", { ip: "10.0.0.2" }))).rejects.toBeInstanceOf(PunchRefusedError);
    await uc.punch(ORG, EMP, punch("work", { ip: "10.0.0.1", latitude: 41.1, longitude: -8.6 }));
    // D7: geolocalização desligada → as coordenadas enviadas não são guardadas.
    expect(repo.events[0]).toMatchObject({ latitude: null, longitude: null, ip: "10.0.0.1" });
  });

  test("CF_11_fora_da_zona_do_centro_recusa_e_dentro_aceita_com_coordenadas", async () => {
    const { uc, ctx, repo } = setup();
    ctx.config_.policy.requireCoordinates = true;
    ctx.config_.policy.blockOutsideGeofence = true;
    ctx.location = { id: "loc-1", latitude: 41.15, longitude: -8.61, radiusMeters: 100 };
    await expect(uc.punch(ORG, EMP, punch("work", { latitude: 41.2, longitude: -8.61 }))).rejects.toMatchObject({ code: "outside_geofence" });
    await uc.punch(ORG, EMP, punch("work", { latitude: 41.1502, longitude: -8.6101 }));
    expect(repo.events[0]).toMatchObject({ latitude: 41.1502, locationId: "loc-1" });
  });

  test("RE_10_correcao_da_gestao_sem_motivo_e_recusada_e_com_motivo_fica_auditada", async () => {
    const { uc, audit, event } = setup();
    event("2026-10-09T09:00:00");
    event("2026-10-09T17:00:00", "off");
    const input = { operation: "update" as const, targetEventId: "ev-2", occurredAt: at("2026-10-09T18:00:00"), segmentType: null, reason: "  " };
    await expect(uc.revise(ORG, BOSS, "e1", input)).rejects.toBeInstanceOf(AttendanceValidationError);
    await expect(uc.revise(ORG, BOSS, "e1", input)).rejects.toMatchObject({ field: "reason" });
    const rev = await uc.revise(ORG, BOSS, "e1", { ...input, reason: "Esqueceu-se de picar a saída" });
    expect(rev.reason).toBe("Esqueceu-se de picar a saída");
    expect(audit.entries).toContainEqual({ action: "attendance.revision.create", reason: "Esqueceu-se de picar a saída" });
    const { days } = await uc.days(ORG, "e1", "2026-10-09", "2026-10-09");
    expect(days[0]!.workedSeconds).toBe(9 * 3600);
  });

  test("ninguém corrige o próprio registo", async () => {
    const { uc, event } = setup();
    event("2026-10-09T09:00:00");
    await expect(uc.revise(ORG, EMP, "e1", { operation: "void", targetEventId: "ev-1", occurredAt: null, segmentType: null, reason: "x" })).rejects.toBeInstanceOf(AttendanceForbiddenError);
  });

  test("correção no futuro é recusada", async () => {
    const { uc } = setup();
    await expect(uc.revise(ORG, BOSS, "e1", { operation: "add", targetEventId: null, occurredAt: at("2026-10-13T09:00:00"), segmentType: "work", reason: "x" })).rejects.toMatchObject({ field: "occurredAt" });
  });

  test("RE_11_colaborador_recusa_dentro_das_48h_e_depois_ja_nao", async () => {
    const { uc, ctx, clock, event } = setup();
    ctx.config_.refusal = { enabled: true, hours: 48 };
    event("2026-10-09T09:00:00");
    event("2026-10-09T17:00:00", "off");
    const r1 = await uc.revise(ORG, BOSS, "e1", { operation: "update", targetEventId: "ev-1", occurredAt: at("2026-10-09T10:00:00"), segmentType: null, reason: "Entrou às 10h" });
    expect(r1.refusableUntil).toBe(new Date(Date.parse(clock.value) + 48 * 3600_000).toISOString());
    expect((await uc.myStatus(ORG, EMP)).refusable.map((r) => r.id)).toEqual([r1.id]);
    clock.value = at("2026-10-13T10:00:00"); // 24h depois
    await uc.refuseRevision(ORG, EMP, r1.id, "Entrei às 9h");
    expect((await uc.days(ORG, "e1", "2026-10-09", "2026-10-09")).days[0]!.workedSeconds).toBe(8 * 3600);
    await expect(uc.refuseRevision(ORG, EMP, r1.id, null)).rejects.toMatchObject({ code: "not_refusable" });

    const r2 = await uc.revise(ORG, BOSS, "e1", { operation: "update", targetEventId: "ev-2", occurredAt: at("2026-10-09T16:00:00"), segmentType: null, reason: "Saiu às 16h" });
    clock.value = at("2026-10-15T10:01:00"); // mais de 48h
    await expect(uc.refuseRevision(ORG, EMP, r2.id, null)).rejects.toMatchObject({ code: "refusal_window_closed" });
  });

  test("sem a regra ligada, as correções não são recusáveis", async () => {
    const { uc, event } = setup();
    event("2026-10-09T09:00:00");
    const r = await uc.revise(ORG, BOSS, "e1", { operation: "void", targetEventId: "ev-1", occurredAt: null, segmentType: null, reason: "Duplicada" });
    expect(r.refusableUntil).toBeNull();
    await expect(uc.refuseRevision(ORG, EMP, r.id, null)).rejects.toMatchObject({ code: "not_refusable" });
  });

  test("TK_13_mudanca_de_configuracao_cria_nova_versao_e_ajuste_sem_mudar_o_passado_em_silencio", async () => {
    const { uc, repo, ctx, event } = setup();
    event("2026-10-08T09:00:00");
    event("2026-10-08T18:00:00", "off");
    await uc.recalculate(ORG, "e1", "2026-10-08", "2026-10-08", "inicial");
    expect(repo.days).toHaveLength(1);
    expect(repo.days[0]).toMatchObject({ version: 1, excessSeconds: 3600 });
    // Sem mudanças → não cria versão.
    expect((await uc.recalculate(ORG, "e1", "2026-10-08", "2026-10-08", "igual")).changed).toBe(0);
    // O horário passa a 7h (configuração retroativa).
    ctx.plan = () => ({ theoreticalMinutes: 420, plannedStart: null, plannedEnd: null, nightSchedule: false, excused: false });
    await uc.recalculate(ORG, "e1", "2026-10-08", "2026-10-08", "Horário alterado");
    expect(repo.days.map((d) => [d.version, d.current, d.excessSeconds])).toEqual([
      [1, false, 3600],
      [2, true, 7200],
    ]);
    expect(repo.adjustments).toEqual([expect.objectContaining({ workDate: "2026-10-08", fromVersion: 1, toVersion: 2, deltaExcessSeconds: 3600, reason: "Horário alterado" })]);
  });

  test("a vista grava em segundo plano os dias desatualizados; o dia de hoje não é gravado", async () => {
    const { uc, repo, bg, event } = setup();
    event("2026-10-11T09:00:00");
    event("2026-10-11T17:00:00", "off");
    const v = await uc.days(ORG, "e1", "2026-10-11", "2026-10-12");
    expect(v.days.map((d) => d.version)).toEqual([null, null]);
    await bg.flush();
    expect(repo.days.map((d) => d.workDate)).toEqual(["2026-10-11"]);
    expect((await uc.days(ORG, "e1", "2026-10-11", "2026-10-12")).days.map((d) => d.version)).toEqual([1, null]);
  });

  test("RE_14_incidente_abre_uma_vez_e_fecha_sozinho_quando_as_marcacoes_sao_corrigidas", async () => {
    const { uc, repo } = setup();
    await uc.recalculate(ORG, "e1", "2026-10-07", "2026-10-07", "x");
    await uc.recalculate(ORG, "e1", "2026-10-07", "2026-10-07", "x");
    expect(repo.incidents.map((i) => [i.workDate, i.type, i.status])).toEqual([["2026-10-07", "missing_in", "open"]]);
    await uc.revise(ORG, BOSS, "e1", { operation: "add", targetEventId: null, occurredAt: at("2026-10-07T09:00:00"), segmentType: "work", reason: "Picou no papel" });
    await uc.revise(ORG, BOSS, "e1", { operation: "add", targetEventId: null, occurredAt: at("2026-10-07T17:00:00"), segmentType: "off", reason: "Picou no papel" });
    expect(repo.incidents[0]).toMatchObject({ status: "resolved_correct", resolvedBy: "sistema" });
  });

  test("D8_validar_incidente_exige_comentario_e_faz_as_horas_pendentes_contarem", async () => {
    const { uc, repo, event } = setup();
    event("2026-10-08T09:00:00"); // nunca saiu
    await uc.recalculate(ORG, "e1", "2026-10-08", "2026-10-08", "x");
    expect(repo.days[0]).toMatchObject({ workedSeconds: 0, pendingSeconds: 15 * 3600 });
    const inc = repo.incidents.find((i) => i.type === "missing_out")!;
    await expect(uc.resolveIncident(ORG, BOSS, inc.id, "validate", null)).rejects.toMatchObject({ field: "comment" });
    await expect(uc.resolveIncident(ORG, EMP, inc.id, "validate", "ok")).rejects.toMatchObject({ code: "self_approval" });
    await uc.resolveIncident(ORG, BOSS, inc.id, "validate", "Confirmado com a chefe de sala");
    const cur = repo.days.find((d) => d.current)!;
    expect(cur).toMatchObject({ version: 2, workedSeconds: 15 * 3600, pendingSeconds: 0 });
    await expect(uc.resolveIncident(ORG, BOSS, inc.id, "dismiss", "x")).rejects.toMatchObject({ code: "already_resolved" });
  });

  test("pedido de correção: o próprio não decide, recusar exige motivo, aprovar cria revisão não recusável", async () => {
    const { uc, repo, ctx } = setup();
    ctx.config_.refusal = { enabled: true, hours: 48 };
    const c = await uc.requestCorrection(ORG, EMP, { operation: "add", targetEventId: null, occurredAt: at("2026-10-10T09:00:00"), segmentType: "work", reason: "Telemóvel sem bateria" });
    await expect(uc.decideCorrection(ORG, EMP, c.id, "approve", null)).rejects.toMatchObject({ code: "self_approval" });
    await expect(uc.decideCorrection(ORG, BOSS, c.id, "reject", "")).rejects.toMatchObject({ field: "comment" });
    const d = await uc.decideCorrection(ORG, BOSS, c.id, "approve", null);
    expect(d.status).toBe("approved");
    expect(repo.revisions[0]).toMatchObject({ id: d.revisionId, refusableUntil: null, author: BOSS.email, reason: "Telemóvel sem bateria" });
    await expect(uc.decideCorrection(ORG, BOSS, c.id, "reject", "x")).rejects.toMatchObject({ code: "already_decided" });
    expect(await uc.myCorrections(ORG, EMP)).toHaveLength(1);
  });

  test("pedido de correção só sobre marcações do próprio", async () => {
    const { uc, repo } = setup();
    repo.events.push({ id: "other", employeeId: "e2", occurredAt: at("2026-10-10T09:00:00"), segmentType: "work", source: "web", clientEventId: null, locationId: null, latitude: null, longitude: null, ip: null });
    await expect(uc.requestCorrection(ORG, EMP, { operation: "void", targetEventId: "other", occurredAt: null, segmentType: null, reason: "x" })).rejects.toThrow("Marcação não encontrada");
  });

  test("revisão sobre uma marcação acrescentada por revisão (rev:<id>)", async () => {
    const { uc } = setup();
    const add = await uc.revise(ORG, BOSS, "e1", { operation: "add", targetEventId: null, occurredAt: at("2026-10-10T09:00:00"), segmentType: "work", reason: "a" });
    await uc.revise(ORG, BOSS, "e1", { operation: "add", targetEventId: null, occurredAt: at("2026-10-10T17:00:00"), segmentType: "off", reason: "a" });
    await uc.revise(ORG, BOSS, "e1", { operation: "update", targetEventId: `rev:${add.id}`, occurredAt: at("2026-10-10T10:00:00"), segmentType: null, reason: "hora certa" });
    expect((await uc.days(ORG, "e1", "2026-10-10", "2026-10-10")).days[0]!.workedSeconds).toBe(7 * 3600);
  });

  test("recálculo pedido pela gestão passa pela fila e respeita o limite do período", async () => {
    const { uc, repo, bg, event } = setup();
    event("2026-10-05T09:00:00");
    event("2026-10-05T17:00:00", "off");
    expect(await uc.requestRecalculation(ORG, ADMIN, "e1", "2026-10-01", "2026-10-06")).toEqual({ queued: 6 });
    await bg.flush();
    expect(repo.queue).toEqual([]);
    expect(repo.days.find((d) => d.workDate === "2026-10-05")).toMatchObject({ workedSeconds: 8 * 3600 });
    await expect(uc.requestRecalculation(ORG, ADMIN, "e1", "2026-08-01", "2026-10-06")).rejects.toMatchObject({ field: "to" });
  });
});

describe("boardMany — em lote, igual a board por pessoa (perf da Visão geral)", () => {
  test("mesmo resultado que board para cada um, com uma leitura de marcações/revisões/incidentes", async () => {
    const { uc, repo } = setup(at("2026-10-14T12:00:00"));
    const ev = (employeeId: string, local: string, segmentType: "work" | "off" | "break_unpaid") =>
      repo.events.push({ id: `ev-${repo.events.length + 1}`, employeeId, occurredAt: at(local), segmentType, source: "web", clientEventId: null, locationId: null, latitude: null, longitude: null, ip: null });
    // e1: dia normal com pausa; e2: turno que cruza a meia-noite; e3: marcação anulada por revisão + incidente validado; e4: sem marcações.
    ev("e1", "2026-10-13T09:00:00", "work");
    ev("e1", "2026-10-13T13:00:00", "break_unpaid");
    ev("e1", "2026-10-13T14:00:00", "work");
    ev("e1", "2026-10-13T18:00:00", "off");
    ev("e2", "2026-10-12T22:00:00", "work");
    ev("e2", "2026-10-13T06:00:00", "off");
    ev("e3", "2026-10-13T08:00:00", "work");
    ev("e3", "2026-10-13T08:05:00", "work");
    ev("e3", "2026-10-13T16:00:00", "off");
    await repo.insertRevision(ORG, { employeeId: "e3", operation: "void", targetEventId: repo.events.at(-2)!.id, occurredAt: null, segmentType: null, anchorAt: at("2026-10-13T08:05:00"), reason: "Duplicada", author: "gestora@demo.invalid", state: "active", refusableUntil: null, before: null });
    repo.incidents.push({ id: "inc-1", employeeId: "e3", workDate: "2026-10-13", type: "late", source: "engine", status: "resolved_validate", comment: null, resolvedBy: "gestora@demo.invalid", resolvedAt: at("2026-10-13T20:00:00") });
    const ids = ["e1", "e2", "e3", "e4"];

    const one = new Map<string, Awaited<ReturnType<typeof uc.board>>>();
    for (const id of ids) one.set(id, await uc.board(ORG, id, "2026-10-12", "2026-10-14"));
    const single = repo.singleReads;
    repo.reads = { events: 0, revisions: 0, incidents: 0 };

    const many = await uc.boardMany(ORG, ids, "2026-10-12", "2026-10-14", 2);
    expect(many).toEqual(one);
    // Uma leitura de cada tipo para os 4 — nenhuma leitura de marcações por pessoa.
    expect(repo.reads).toEqual({ events: 1, revisions: 1, incidents: 1 });
    expect(repo.singleReads).toBe(single);
    // Há trabalho apurado (o teste não compara vazio com vazio).
    expect(many.get("e1")!.days.find((d) => d.workDate === "2026-10-13")!.workedSeconds).toBeGreaterThan(0);
  });

  test("sem colaboradores não lê nada", async () => {
    const { uc, repo } = setup();
    expect((await uc.boardMany(ORG, [], "2026-10-12", "2026-10-12")).size).toBe(0);
    expect(repo.reads).toEqual({ events: 0, revisions: 0, incidents: 0 });
  });
});

describe("Fluxo de aprovação das correções de ponto (FE-113)", () => {
  const ask = { operation: "add" as const, targetEventId: null, segmentType: "work" as const, reason: "Esqueci-me de picar" };
  const L2 = { userId: "u-dir", email: "direcao@demo.invalid" };

  test("com fluxo: níveis fixados sem quem pede; só o nível atual decide; aprovar avança e o último cria a revisão", async () => {
    const { uc, ctx, repo } = setup();
    ctx.levels = [
      { approvers: ["u-boss", "u-emp"], escalated: false },
      { approvers: ["u-dir"], escalated: false },
    ];
    const c = await uc.requestCorrection(ORG, EMP, { ...ask, occurredAt: at("2026-10-10T09:00:00") });
    expect(c.levels[0]!.approvers).toEqual(["u-boss"]);
    await expect(uc.decideCorrection(ORG, L2, c.id, "approve", null)).rejects.toMatchObject({ code: "not_approver" });
    const mid = await uc.decideCorrection(ORG, BOSS, c.id, "approve", null);
    expect(mid).toMatchObject({ status: "pending", currentLevel: 1 });
    expect(repo.revisions).toHaveLength(0);
    await expect(uc.decideCorrection(ORG, BOSS, c.id, "approve", null)).rejects.toMatchObject({ code: "not_approver" });
    const done = await uc.decideCorrection(ORG, L2, c.id, "approve", null);
    expect(done.status).toBe("approved");
    expect(repo.revisions).toHaveLength(1);
  });

  test("recusar no primeiro nível termina o pedido; fluxo sem ninguém para aprovar recusa o pedido logo à entrada", async () => {
    const { uc, ctx } = setup();
    ctx.levels = [{ approvers: ["u-boss"], escalated: false }, { approvers: ["u-dir"], escalated: false }];
    const c = await uc.requestCorrection(ORG, EMP, { ...ask, occurredAt: at("2026-10-10T09:00:00") });
    expect((await uc.decideCorrection(ORG, BOSS, c.id, "reject", "Não há registo de entrada nesse dia")).status).toBe("rejected");
    ctx.levels = "no_approver";
    await expect(uc.requestCorrection(ORG, EMP, { ...ask, occurredAt: at("2026-10-09T09:00:00") })).rejects.toMatchObject({ field: "flow" });
  });

  test("sem fluxo de ponto: como antes (quem gere a assiduidade decide, nunca o próprio)", async () => {
    const { uc } = setup();
    const c = await uc.requestCorrection(ORG, EMP, { ...ask, occurredAt: at("2026-10-10T09:00:00") });
    expect(c.levels).toEqual([]);
    expect((await uc.decideCorrection(ORG, BOSS, c.id, "approve", null)).status).toBe("approved");
  });
});

describe("Catálogo de pausas (FE-103)", () => {
  const LUNCH = { name: "Almoço", color: "#10B981", remuneration: "unpaid" as const, hybridPaidMinutes: null, maxMinutes: 60, windowStart: "11:30", windowEnd: "15:00", maxUsesPerDay: 1, weekdays: [1, 2, 3, 4, 5] };
  const COFFEE = { name: "Café", color: null, remuneration: "hybrid" as const, hybridPaidMinutes: 15, maxMinutes: null, windowStart: null, windowEnd: null, maxUsesPerDay: null, weekdays: null };
  const punch = (segmentType: "work" | "off" | "break_paid" | "break_unpaid", breakTypeId: string | null = null) => ({ segmentType, source: "web" as const, clientEventId: null, locationId: null, latitude: null, longitude: null, ip: null, breakTypeId });

  test("remuneração é escolha obrigatória; nome único (sem acentos nem maiúsculas); alterar exige motivo", async () => {
    const { uc } = setup();
    await expect(uc.createBreakType(ORG, ADMIN, { ...LUNCH, remuneration: "" as never })).rejects.toMatchObject({ field: "remuneration" });
    await expect(uc.createBreakType(ORG, ADMIN, { ...COFFEE, hybridPaidMinutes: null })).rejects.toMatchObject({ field: "hybridPaidMinutes" });
    const b = await uc.createBreakType(ORG, ADMIN, LUNCH);
    await expect(uc.createBreakType(ORG, ADMIN, { ...LUNCH, name: " almoco " })).rejects.toMatchObject({ code: "duplicate_name" });
    await expect(uc.updateBreakType(ORG, ADMIN, b.id, { ...LUNCH, maxMinutes: 45 }, b.version, "")).rejects.toMatchObject({ field: "reason" });
    expect((await uc.updateBreakType(ORG, ADMIN, b.id, { ...LUNCH, maxMinutes: 45 }, b.version, "Acordo com a equipa")).maxMinutes).toBe(45);
    await expect(uc.updateBreakType(ORG, ADMIN, b.id, LUNCH, b.version, "Versão antiga")).rejects.toMatchObject({ code: "stale" });
  });

  test("iniciar pausa: fora da janela e acima das utilizações do dia → recusada; o tipo decide paga/não paga", async () => {
    // 10:00 em Lisboa (segunda): fora da janela do almoço.
    const { uc, repo, clock } = setup(at("2026-10-12T10:00:00"));
    const lunch = await uc.createBreakType(ORG, ADMIN, LUNCH);
    await uc.punch(ORG, EMP, punch("work"));
    await expect(uc.punch(ORG, EMP, punch("break_paid", lunch.id))).rejects.toMatchObject({ field: "breakTypeId" });
    clock.value = at("2026-10-12T12:30:00");
    const r = await uc.punch(ORG, EMP, punch("break_paid", lunch.id));
    expect(r.event.segmentType).toBe("break_unpaid");
    expect(repo.events.at(-1)!.breakTypeId).toBe(lunch.id);
    clock.value = at("2026-10-12T13:15:00");
    await uc.punch(ORG, EMP, punch("work"));
    clock.value = at("2026-10-12T13:40:00");
    await expect(uc.punch(ORG, EMP, punch("break_unpaid", lunch.id))).rejects.toThrow("máximo 1");
  });

  test("cálculo: não paga não conta; híbrida paga só os primeiros minutos do dia; acima da duração máxima não conta", async () => {
    const { uc, repo, event } = setup(at("2026-10-13T10:00:00"));
    const coffee = await uc.createBreakType(ORG, ADMIN, COFFEE);
    const capped = await uc.createBreakType(ORG, ADMIN, { ...COFFEE, name: "Paga curta", remuneration: "paid", hybridPaidMinutes: null, maxMinutes: 10 });
    const typed = (local: string, segmentType: "break_paid" | "break_unpaid", breakTypeId: string) => {
      event(local, segmentType);
      repo.events.at(-1)!.breakTypeId = breakTypeId;
    };
    // 2026-10-12: 09:00–17:00 com café 10:00–10:10 e 15:00–15:10 (híbrida 15 min) e pausa paga 12:00–12:30 (máx. 10).
    event("2026-10-12T09:00:00");
    typed("2026-10-12T10:00:00", "break_paid", coffee.id);
    event("2026-10-12T10:10:00");
    typed("2026-10-12T12:00:00", "break_paid", capped.id);
    event("2026-10-12T12:30:00");
    typed("2026-10-12T15:00:00", "break_paid", coffee.id);
    event("2026-10-12T15:10:00");
    event("2026-10-12T17:00:00", "off");
    const d = (await uc.days(ORG, "e1", "2026-10-12", "2026-10-12")).days[0]!;
    // Trabalho 8 h − 50 min de pausas = 7h10; pagas: café 10 + 5 (quota 15) + pausa curta 10 → 7h35.
    expect(d.workedSeconds).toBe((7 * 60 + 35) * 60);
    expect(d.breakSeconds).toBe(50 * 60);
  });

  test("dias sem pausas com tipo mantêm a mesma impressão de configuração (criar pausas não gera versões em massa)", async () => {
    const { uc, repo, event } = setup(at("2026-10-13T10:00:00"));
    event("2026-10-12T09:00:00");
    event("2026-10-12T17:00:00", "off");
    await uc.recalculate(ORG, "e1", "2026-10-12", "2026-10-12", "teste");
    const before = repo.days.filter((d) => d.workDate === "2026-10-12").length;
    await uc.createBreakType(ORG, ADMIN, COFFEE);
    const r = await uc.recalculate(ORG, "e1", "2026-10-12", "2026-10-12", "teste");
    expect(r.changed).toBe(0);
    expect(repo.days.filter((d) => d.workDate === "2026-10-12").length).toBe(before);
  });
});

describe("Tipos de registo (FE-105)", () => {
  const TRAINING = { name: "Formação", color: "#6366F1", remote: false, remuneration: "paid" as const, hybridPaidMinutes: null, maxMinutesPerDay: 120, blockedWeekdays: [6, 7], blockedHours: [{ start: "12:00", end: "13:00" }] };
  const TRAVEL = { name: "Deslocação", color: null, remote: false, remuneration: "hybrid" as const, hybridPaidMinutes: 30, maxMinutesPerDay: null, blockedWeekdays: null, blockedHours: [] };
  const HOME = { name: "Teletrabalho", color: null, remote: true, remuneration: "paid" as const, hybridPaidMinutes: null, maxMinutesPerDay: null, blockedWeekdays: null, blockedHours: [] };
  const punch = (segmentType: "work" | "off" | "remote", clockTypeId: string | null = null) => ({ segmentType, source: "web" as const, clientEventId: null, locationId: null, latitude: null, longitude: null, ip: null, clockTypeId });

  test("validação: remuneração obrigatória, não bloquear os 7 dias, nome único", async () => {
    const { uc } = setup();
    await expect(uc.createClockType(ORG, ADMIN, { ...TRAINING, remuneration: "" as never })).rejects.toMatchObject({ field: "remuneration" });
    await expect(uc.createClockType(ORG, ADMIN, { ...TRAINING, blockedWeekdays: [1, 2, 3, 4, 5, 6, 7] })).rejects.toMatchObject({ field: "blockedWeekdays" });
    await uc.createClockType(ORG, ADMIN, TRAINING);
    await expect(uc.createClockType(ORG, ADMIN, { ...TRAINING, name: "FORMACAO" })).rejects.toMatchObject({ code: "duplicate_name" });
  });

  test("começar: hora bloqueada → recusa; teletrabalho fica remoto; o máximo do dia impede recomeçar", async () => {
    const { uc, repo, clock } = setup(at("2026-10-12T12:30:00"));
    const training = await uc.createClockType(ORG, ADMIN, TRAINING);
    const home = await uc.createClockType(ORG, ADMIN, HOME);
    await expect(uc.punch(ORG, EMP, punch("work", training.id))).rejects.toThrow("bloqueado entre 12:00 e 13:00");
    clock.value = at("2026-10-12T13:00:00");
    await uc.punch(ORG, EMP, punch("work", training.id));
    expect(repo.events.at(-1)).toMatchObject({ segmentType: "work", clockTypeId: training.id });
    clock.value = at("2026-10-12T15:00:00");
    const r = await uc.punch(ORG, EMP, punch("work", home.id));
    expect(r.event.segmentType).toBe("remote");
    clock.value = at("2026-10-12T15:30:00");
    await expect(uc.punch(ORG, EMP, punch("work", training.id))).rejects.toThrow("máximo de 120 min");
  });

  test("cálculo: formação conta até 2 h/dia; deslocação híbrida conta só 30 min; obra normal conta tudo", async () => {
    const { uc, repo, event } = setup(at("2026-10-13T10:00:00"));
    const training = await uc.createClockType(ORG, ADMIN, TRAINING);
    const travel = await uc.createClockType(ORG, ADMIN, TRAVEL);
    const typed = (local: string, id: string) => {
      event(local, "work");
      repo.events.at(-1)!.clockTypeId = id;
    };
    // 2026-10-12: deslocação 08:00–09:00, obra 09:00–13:00, formação 14:00–17:00.
    typed("2026-10-12T08:00:00", travel.id);
    event("2026-10-12T09:00:00");
    event("2026-10-12T13:00:00", "off");
    typed("2026-10-12T14:00:00", training.id);
    event("2026-10-12T17:00:00", "off");
    const d = (await uc.days(ORG, "e1", "2026-10-12", "2026-10-12")).days[0]!;
    // 30 min (deslocação) + 4 h (obra) + 2 h (formação, máx.) = 6h30.
    expect(d.workedSeconds).toBe((6 * 60 + 30) * 60);
  });
});

describe("Portal ligado ao Novo RH (Fase 2)", () => {
  test("myPortalMode: o Novo RH é sempre a fonte (sem interruptor)", async () => {
    const { uc } = setup();
    expect(await uc.myPortalMode(ORG, EMP)).toEqual({ source: "novo_rh" });
  });
});
