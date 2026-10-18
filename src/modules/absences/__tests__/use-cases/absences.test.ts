import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { AbsencesUseCases, type RequestInput } from "../../application/use-cases/absences.use-cases.js";
import { rulesFor, type AbsenceTypeInput } from "../../domain/entities/absence-type.js";
import { snapshotLevels, validateFlow } from "../../domain/entities/approval-flow.js";
import { absenceEffect, periodStart, requestAmount } from "../../domain/services/absence-calc.js";
import { AbsenceRuleError, AbsenceValidationError } from "../../domain/errors.js";
import { FakeAbsencesAudit, FakeAbsencesContext, FakeAbsencesRepository, FakeNotifier, TYPE_BASE, weekdayPlan } from "../fakes/fake-absences.js";

const ORG = mintOrganizationId("org-a");
const EMP = { userId: "u-emp", email: "colaborador@demo.invalid" };
const BOSS = { userId: "u-boss", email: "gestora@demo.invalid" };
const RH = { userId: "u-rh", email: "rh@demo.invalid" };
const ADMIN = { userId: "u-admin", email: "admin@demo.invalid" };
const PROFILE_RH = "profile:11111111-1111-4111-8111-111111111111";

function setup() {
  const repo = new FakeAbsencesRepository();
  const ctx = new FakeAbsencesContext();
  const notifier = new FakeNotifier();
  const uc = new AbsencesUseCases(repo, ctx, notifier, new FakeAbsencesAudit(), { today: async () => "2026-10-12" });
  return { repo, ctx, notifier, uc };
}

const req = (typeId: string, over: Partial<RequestInput> = {}): RequestInput => ({
  employeeId: "e1",
  typeId,
  startDate: "2026-10-19",
  endDate: "2026-10-19",
  startTime: null,
  endTime: null,
  halfDay: false,
  comment: null,
  attachmentDocumentId: null,
  ...over,
});

async function typeWith(uc: AbsencesUseCases, over: Partial<AbsenceTypeInput> = {}) {
  return uc.createType(mintOrganizationId("org-a"), ADMIN, { ...TYPE_BASE, ...over });
}

describe("Ausências — cálculo (domínio)", () => {
  const rules = (over: Partial<AbsenceTypeInput> = {}) => rulesFor({ ...TYPE_BASE, ...over, id: "t", archived: false }, null);
  const days = (from: string, to: string) => {
    const out = [];
    for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(weekdayPlan(d.toISOString().slice(0, 10)));
    return out;
  };
  const input = (startDate: string, endDate: string, startTime: string | null = null, endTime: string | null = null) => ({ startDate, endDate, startTime, endTime, halfDay: false });

  test("RE_19_dias_uteis_num_domingo_nao_esta_disponivel", () => {
    expect(requestAmount(rules(), days("2026-10-18", "2026-10-18"), input("2026-10-18", "2026-10-18"))).toEqual({ amount: 0, unavailable: "2026-10-18" });
    expect(requestAmount(rules(), days("2026-10-19", "2026-10-23"), input("2026-10-19", "2026-10-23")).amount).toBe(5);
  });

  test("RE_20_dias_naturais_03_06_a_26_07_sao_54", () => {
    expect(requestAmount(rules({ counting: "calendar" }), days("2026-06-03", "2026-07-26"), input("2026-06-03", "2026-07-26")).amount).toBe(54);
  });

  test("RE_21_CF_8_horas_so_dentro_do_horario_09_12_com_2h30_no_horario", () => {
    const morning = [{ date: "2026-10-19", minutes: 480, plannedRanges: [{ start: "09:30", end: "12:00" }, { start: "13:00", end: "18:30" }] }];
    const r = requestAmount(rules({ unit: "hours" }), morning, input("2026-10-19", "2026-10-19", "09:00", "12:00"));
    expect(r.amount).toBe(2.5);
    expect(requestAmount(rules({ unit: "hours", intersectSchedule: false }), morning, input("2026-10-19", "2026-10-19", "09:00", "12:00")).amount).toBe(3);
  });

  test("período: ano natural ou aniversário do contrato", () => {
    expect(periodStart("calendar_year", "2026-10-19", "2020-03-15")).toBe("2026-01-01");
    expect(periodStart("work_year", "2026-10-19", "2020-03-15")).toBe("2026-03-15");
    expect(periodStart("work_year", "2026-02-01", "2020-03-15")).toBe("2025-03-15");
  });

  test("CF_7_descontar_do_horario_poe_teorico_a_0_e_contar_como_trabalhado_soma_8h", () => {
    expect(absenceEffect(480, "reduce_theoretical", "full")).toEqual({ reduceMinutes: 480, creditMinutes: 0, excused: true });
    expect(absenceEffect(480, "count_as_worked", "full")).toEqual({ reduceMinutes: 0, creditMinutes: 480, excused: true });
    expect(absenceEffect(480, "none", "full")).toEqual({ reduceMinutes: 0, creditMinutes: 0, excused: true });
  });

  test("CF_5_fluxo_com_nivel_sem_aprovador_nao_e_valido", () => {
    expect(() => validateFlow({ name: "Férias", scope: "absences", isDefault: true, levels: [{ people: ["u-boss"], roles: [] }, { people: [], roles: [] }], fallbackUserIds: [] })).toThrow("O nível 2 não tem aprovadores.");
  });

  test("RE_22_RE_23_quem_pede_nao_aprova_e_nivel_vazio_escala_para_o_recurso", () => {
    const snap = snapshotLevels([["u-boss", "u-emp"], [], ["u-emp"]], new Set(["u-emp"]), ["u-admin"]);
    expect(snap).toEqual([
      { approvers: ["u-boss"], escalated: false },
      { approvers: ["u-admin"], escalated: true },
      { approvers: ["u-admin"], escalated: true },
    ]);
    expect(snapshotLevels([[]], new Set(["u-admin"]), ["u-admin"])).toBeNull();
  });
});

describe("Ausências — pedidos e aprovações", () => {
  test("TK_14_pedido_fora_da_vigencia_do_contrato_e_recusado", async () => {
    const { uc, ctx } = setup();
    ctx.contract = { from: "2020-03-15", to: "2026-10-16" };
    const t = await typeWith(uc);
    await expect(uc.createRequest(ORG, EMP, req(t.id), "self")).rejects.toMatchObject({ code: "outside_contract" });
  });

  test("RE_19_pedido_num_domingo_e_recusado_com_a_mensagem", async () => {
    const { uc } = setup();
    const t = await typeWith(uc);
    await expect(uc.createRequest(ORG, EMP, req(t.id, { startDate: "2026-10-18", endDate: "2026-10-18" }), "self")).rejects.toThrow("A data selecionada não está disponível com a configuração selecionada");
  });

  test("RE_21_saldo_de_18h_menos_2h30_fica_15h30", async () => {
    const { uc, ctx } = setup();
    ctx.plan = (date) => ({ date, minutes: 480, plannedRanges: [{ start: "09:30", end: "12:00" }, { start: "13:00", end: "18:30" }] });
    const t = await typeWith(uc, { unit: "hours", limitAmount: 18, requiresApproval: false });
    await uc.createRequest(ORG, EMP, req(t.id, { startTime: "09:00", endTime: "12:00" }), "self");
    const [b] = await uc.balances(ORG, "e1", "2026-10-19", true);
    expect(b).toMatchObject({ accrued: 18, used: 2.5, available: 15.5, unit: "hours" });
  });

  test("RE_22_gestor_que_pede_nao_aprova_e_o_pedido_sobe_ao_nivel_seguinte", async () => {
    const { uc, repo } = setup();
    const flow = await uc.createFlow(ORG, ADMIN, { name: "Férias", scope: "absences", isDefault: true, levels: [{ people: [], roles: ["managers"] }, { people: [], roles: [PROFILE_RH] }], fallbackUserIds: [] });
    expect(flow.isDefault).toBe(true);
    const t = await typeWith(uc);
    // A gestora (e9) pede para si: o seu responsável não existe → nível 1 escala; ela nunca é aprovadora.
    const r = await uc.createRequest(ORG, BOSS, req(t.id, { employeeId: "e9" }), "self");
    expect(r.levels[0]).toEqual({ approvers: ["u-admin"], escalated: true });
    await expect(uc.decide(ORG, BOSS, r.id, "approve", null)).rejects.toMatchObject({ code: "self_approval" });
    expect(repo.decisions.filter((d) => d.decision === "escalated")).toHaveLength(1);
  });

  test("RE_23_nivel_vazio_nao_aprova_sozinho_escala_e_gera_alerta", async () => {
    const { uc, ctx, notifier, repo } = setup();
    ctx.managers.set("e1", []);
    await uc.createFlow(ORG, ADMIN, { name: "Férias", scope: "absences", isDefault: true, levels: [{ people: [], roles: ["managers"] }], fallbackUserIds: ["u-rh"] });
    const t = await typeWith(uc);
    const r = await uc.createRequest(ORG, EMP, req(t.id), "self");
    expect(r.status).toBe("pending");
    expect(r.levels).toEqual([{ approvers: ["u-rh"], escalated: true }]);
    expect(notifier.sent).toContainEqual({ userIds: ["u-rh"], title: "Pedido de ausência escalado para si" });
    await uc.decide(ORG, RH, r.id, "approve", null);
    expect(repo.requests[0]!.status).toBe("approved");
  });

  test("CF_5_fluxo_com_perfil_sem_ninguem_nao_e_gravado", async () => {
    const { uc, repo } = setup();
    await expect(uc.createFlow(ORG, ADMIN, { name: "X", scope: "absences", isDefault: false, levels: [{ people: [], roles: ["profile:22222222-2222-4222-8222-222222222222"] }], fallbackUserIds: [] })).rejects.toBeInstanceOf(AbsenceValidationError);
    expect(repo.flows).toEqual([]);
  });

  test("multinível: aprovar nível 1 passa ao 2; só o aprovador do nível decide; recusar fecha", async () => {
    const { uc, repo } = setup();
    await uc.createFlow(ORG, ADMIN, { name: "Férias", scope: "absences", isDefault: true, levels: [{ people: [], roles: ["managers"] }, { people: [], roles: [PROFILE_RH] }], fallbackUserIds: [] });
    const t = await typeWith(uc);
    const r = await uc.createRequest(ORG, EMP, req(t.id), "self");
    await expect(uc.decide(ORG, RH, r.id, "approve", null)).rejects.toMatchObject({ code: "not_approver" });
    expect((await uc.decide(ORG, BOSS, r.id, "approve", null)).currentLevel).toBe(1);
    expect((await uc.myApprovals(ORG, RH, false)).map((x) => x.id)).toEqual([r.id]);
    expect((await uc.decide(ORG, RH, r.id, "reject", "Período de inventário")).status).toBe("rejected");
    expect(repo.entries.filter((e) => e.kind === "request")).toEqual([]);
  });

  test("RE_25_aprovar_cancelar_e_reaprovar_gera_3_movimentos_e_saldo_certo", async () => {
    const { uc, repo, ctx } = setup();
    ctx.vacation = { unit: "days", counting: "working", limited: true, maxAmount: 22, renewal: "calendar_year", seniorityRules: [], cumulative: false, halfDay: true, allowNegative: false, minConsecutive: null, maxConsecutive: null, blockedDates: [] };
    const t = await typeWith(uc, { name: "Férias", category: "vacation" });
    const week = { startDate: "2026-10-19", endDate: "2026-10-23" };
    const r1 = await uc.createRequest(ORG, EMP, req(t.id, week), "self");
    // Sem fluxo configurado, aprovam os administradores (D9).
    await uc.decide(ORG, ADMIN, r1.id, "approve", null);
    await expect(uc.cancel(ORG, BOSS, r1.id, null, true)).rejects.toMatchObject({ field: "reason" });
    await uc.cancel(ORG, BOSS, r1.id, "Mudou de semana", true);
    const r2 = await uc.createRequest(ORG, EMP, req(t.id, week), "self");
    await uc.decide(ORG, ADMIN, r2.id, "approve", null);
    const moves = repo.entries.filter((e) => e.kind !== "accrual").map((e) => [e.kind, e.amount]);
    expect(moves).toEqual([
      ["request", -5],
      ["reversal", 5],
      ["request", -5],
    ]);
    const [b] = await uc.balances(ORG, "e1", "2026-10-19", true);
    expect(b).toMatchObject({ accrued: 22, used: 5, balance: 17, available: 17 });
  });

  test("saldo insuficiente, saldo negativo permitido e pendentes reservam saldo", async () => {
    const { uc } = setup();
    const t = await typeWith(uc, { limitAmount: 2 });
    await uc.createRequest(ORG, EMP, req(t.id, { startDate: "2026-10-19", endDate: "2026-10-20" }), "self");
    await expect(uc.createRequest(ORG, EMP, req(t.id, { startDate: "2026-10-21", endDate: "2026-10-21" }), "self")).rejects.toMatchObject({ code: "insufficient_balance" });
    const neg = await typeWith(uc, { name: "Com negativo", limitAmount: 1, allowNegative: true });
    await expect(uc.createRequest(ORG, EMP, req(neg.id, { startDate: "2026-10-26", endDate: "2026-10-27" }), "self")).resolves.toMatchObject({ amount: 2 });
  });

  test("sobreposição, datas bloqueadas, mínimo/máximo e anexo obrigatório", async () => {
    const { uc } = setup();
    const t = await typeWith(uc, { blockedDates: ["2026-12-24"], minConsecutive: 2, maxConsecutive: 3 });
    await expect(uc.createRequest(ORG, EMP, req(t.id), "self")).rejects.toMatchObject({ code: "min_consecutive" });
    await expect(uc.createRequest(ORG, EMP, req(t.id, { startDate: "2026-10-19", endDate: "2026-10-23" }), "self")).rejects.toMatchObject({ code: "max_consecutive" });
    await expect(uc.createRequest(ORG, EMP, req(t.id, { startDate: "2026-12-23", endDate: "2026-12-24" }), "self")).rejects.toMatchObject({ code: "blocked_date" });
    await uc.createRequest(ORG, EMP, req(t.id, { startDate: "2026-10-19", endDate: "2026-10-20" }), "self");
    await expect(uc.createRequest(ORG, EMP, req(t.id, { startDate: "2026-10-20", endDate: "2026-10-21" }), "self")).rejects.toMatchObject({ code: "overlap" });
    const doc = await typeWith(uc, { name: "Baixa", attachment: "required" });
    await expect(uc.createRequest(ORG, EMP, req(doc.id, { startDate: "2026-11-02", endDate: "2026-11-02" }), "self")).rejects.toBeInstanceOf(AbsenceRuleError);
  });

  test("atribuída pela gestão fica aprovada; tipo oculto não aparece ao colaborador", async () => {
    const { uc, repo } = setup();
    const t = await typeWith(uc, { hiddenFromEmployee: true });
    await expect(uc.createRequest(ORG, EMP, req(t.id), "self")).rejects.toThrow("não encontrado");
    const r = await uc.createRequest(ORG, BOSS, req(t.id), "assign");
    expect(r.status).toBe("approved");
    expect(repo.entries.map((e) => e.kind)).toEqual(["request"]);
    expect(await uc.myTypes(ORG)).toEqual([]);
  });

  test("ausência privada fica mascarada para quem não tem a permissão", async () => {
    const { uc } = setup();
    const t = await typeWith(uc, { name: "Consulta de especialidade", private: true, requiresApproval: false });
    await uc.createRequest(ORG, EMP, req(t.id, { comment: "Oncologia" }), "self");
    const [hidden] = await uc.listRequests(ORG, {}, false, "u-boss");
    expect(hidden).toMatchObject({ typeName: "Ausência", comment: null, private: true });
    const [own] = await uc.listRequests(ORG, {}, false, "u-emp");
    expect(own).toMatchObject({ typeName: "Consulta de especialidade", comment: "Oncologia" });
  });

  test("CF_7_efeito_no_dia_para_a_assiduidade", async () => {
    const { uc } = setup();
    const reduce = await typeWith(uc, { name: "Licença", requiresApproval: false });
    const worked = await typeWith(uc, { name: "Formação", requiresApproval: false, timeImpact: "count_as_worked" });
    await uc.createRequest(ORG, EMP, req(reduce.id, { startDate: "2026-10-19", endDate: "2026-10-19" }), "self");
    await uc.createRequest(ORG, EMP, req(worked.id, { startDate: "2026-10-20", endDate: "2026-10-20" }), "self");
    const fx = await uc.dayEffects(ORG, "e1", "2026-10-19", "2026-10-21", new Map([["2026-10-19", 480], ["2026-10-20", 480], ["2026-10-21", 480]]));
    expect(fx.get("2026-10-19")).toEqual({ reduceMinutes: 480, creditMinutes: 0, excused: true });
    expect(fx.get("2026-10-20")).toEqual({ reduceMinutes: 0, creditMinutes: 480, excused: true });
    expect(fx.has("2026-10-21")).toBe(false);
  });

  test("CF_9_feriado_trabalhado_com_coeficiente_1_da_1_dia_e_com_aprovacao_so_depois_de_aprovado", async () => {
    const { uc, ctx, repo } = setup();
    await typeWith(uc, { name: "Compensação de feriado", category: "compensation", counting: "calendar" });
    ctx.holidays.set("2026-10-05", { name: "Implantação da República", coefficient: 1, approvalRequired: false });
    ctx.worked.set("2026-10-05", 8 * 3600);
    expect(await uc.holidayCompensation(ORG, ADMIN, "e1", "2026-10-01", "2026-10-10")).toEqual({ granted: 1, requested: 0 });
    expect(await uc.holidayCompensation(ORG, ADMIN, "e1", "2026-10-01", "2026-10-10")).toEqual({ granted: 0, requested: 0 });
    expect(repo.entries.filter((e) => e.kind === "holiday_compensation").map((e) => e.amount)).toEqual([1]);

    ctx.holidays.set("2026-12-08", { name: "Imaculada Conceição", coefficient: 1, approvalRequired: true });
    ctx.worked.set("2026-12-08", 4 * 3600);
    expect(await uc.holidayCompensation(ORG, ADMIN, "e1", "2026-12-01", "2026-12-10")).toEqual({ granted: 0, requested: 1 });
    expect(repo.entries.filter((e) => e.kind === "holiday_compensation")).toHaveLength(1);
    const pending = repo.requests.find((r) => r.kind === "holiday_compensation")!;
    await uc.decide(ORG, ADMIN, pending.id, "approve", null);
    expect(repo.entries.filter((e) => e.kind === "holiday_compensation").map((e) => e.referenceDate)).toEqual(["2026-10-05", "2026-12-08"]);
  });

  test("nomes de tipo únicos e ajuste de saldo com motivo", async () => {
    const { uc } = setup();
    const t = await typeWith(uc, { limitAmount: 10 });
    await expect(typeWith(uc, { name: "consulta MÉDICA" })).rejects.toMatchObject({ code: "duplicate_name" });
    await expect(uc.adjust(ORG, ADMIN, { employeeId: "e1", typeId: t.id, period: "2026-01-01", amount: 2, reason: "" })).rejects.toMatchObject({ field: "reason" });
    await uc.adjust(ORG, ADMIN, { employeeId: "e1", typeId: t.id, period: "2026-01-01", amount: 2, reason: "Acordo com RH" });
    const [b] = await uc.balances(ORG, "e1", "2026-10-19", true);
    expect(b).toMatchObject({ accrued: 10, adjusted: 2, balance: 12 });
  });
});

describe("Fluxo de correções de ponto (FE-113)", () => {
  test("sem fluxo de ponto → null; com fluxo → níveis sem quem pede nem o próprio; ninguém → no_approver", async () => {
    const { uc } = setup();
    expect(await uc.correctionLevels(ORG, "e1", "2026-10-10", ["u-emp"])).toBeNull();
    await uc.createFlow(ORG, ADMIN, { name: "Correções", scope: "clock", isDefault: true, levels: [{ people: ["u-boss", "u-emp"], roles: [] }, { people: ["u-rh"], roles: [] }], fallbackUserIds: ["u-admin"] });
    expect(await uc.correctionLevels(ORG, "e1", "2026-10-10", ["u-emp"])).toEqual([
      { approvers: ["u-boss"], escalated: false },
      { approvers: ["u-rh"], escalated: false },
    ]);
    // Nível só com quem pede → recurso (RE-23).
    expect(await uc.correctionLevels(ORG, "e1", "2026-10-10", ["u-emp", "u-boss"])).toEqual([
      { approvers: ["u-admin"], escalated: true },
      { approvers: ["u-rh"], escalated: false },
    ]);
    expect(await uc.correctionLevels(ORG, "e1", "2026-10-10", ["u-emp", "u-boss", "u-admin"])).toBe("no_approver");
  });
});

describe("Anexo do próprio pedido (Portal — justificar falta)", () => {
  class FakeStorage {
    files = new Map<string, Buffer>();
    async upload(org: string, path: string, bytes: Buffer) {
      const real = `${org}/${path}`;
      this.files.set(real, bytes);
      return real;
    }
    async signedUrl(_o: string, path: string) {
      return `https://signed/${path}`;
    }
  }
  function withStorage() {
    const repo = new FakeAbsencesRepository();
    const ctx = new FakeAbsencesContext();
    const storage = new FakeStorage();
    const uc = new AbsencesUseCases(repo, ctx, new FakeNotifier(), new FakeAbsencesAudit(), { today: async () => "2026-10-12" }, undefined, storage);
    return { repo, ctx, storage, uc };
  }
  const pdf = (bytes = 10) => ({ name: "Justificação médica (1).pdf", mime: "application/pdf", bytes: Buffer.alloc(bytes, 1) });

  test("carregar: só PDF/imagem até 10 MB, guardado na pasta do colaborador com nome seguro", async () => {
    const { uc, storage } = withStorage();
    const a = await uc.uploadMyAttachment(ORG, EMP, pdf());
    expect(a.path).toMatch(new RegExp(`^${ORG}/absence-attachments/e1/[0-9a-f-]{36}-Justificacao_medica_1_\.pdf$`));
    expect(storage.files.has(a.path)).toBe(true);
    await expect(uc.uploadMyAttachment(ORG, EMP, { ...pdf(), mime: "application/x-msdownload" })).rejects.toBeInstanceOf(AbsenceValidationError);
    await expect(uc.uploadMyAttachment(ORG, EMP, pdf(10 * 1024 * 1024 + 1))).rejects.toThrow("10 MB");
  });

  test("pedido: aceita o anexo da própria pasta, recusa o de outra pessoa e ignora ids de documento arbitrários", async () => {
    const { uc } = withStorage();
    const t = await typeWith(uc, { attachment: "required" });
    const mine = await uc.uploadMyAttachment(ORG, EMP, pdf());
    // Sem anexo, o tipo exige; um id de documento qualquer não conta no pedido do próprio.
    await expect(uc.createRequest(ORG, EMP, req(t.id, { attachmentDocumentId: "doc-de-outra-pessoa" }), "self")).rejects.toMatchObject({ code: "attachment_required" });
    await expect(uc.createRequest(ORG, EMP, req(t.id, { attachment: { ...mine, path: `${ORG}/absence-attachments/e2/x.pdf` } }), "self")).rejects.toThrow("Anexo inválido");
    await expect(uc.createRequest(ORG, EMP, req(t.id, { attachment: { ...mine, path: `${ORG}/absence-attachments/e1/../e2/x.pdf` } }), "self")).rejects.toThrow("Anexo inválido");
    const r = await uc.createRequest(ORG, EMP, req(t.id, { attachment: mine }), "self");
    expect(r.attachment).toEqual(mine);
    expect(r.attachmentDocumentId).toBeNull();
  });

  test("ver: o próprio e quem aprova; outra pessoa não; a vista mostra só nome (mascarado em privadas)", async () => {
    const { uc, ctx } = withStorage();
    const t = await typeWith(uc, { attachment: "optional", private: true });
    const mine = await uc.uploadMyAttachment(ORG, EMP, pdf());
    const r = await uc.createRequest(ORG, EMP, req(t.id, { attachment: mine }), "self");
    expect((await uc.attachmentUrl(ORG, EMP, r.id, "owner")).url).toBe(`https://signed/${mine.path}`);
    const approver = { userId: r.levels[0]!.approvers[0]!, email: "aprovador@demo.invalid" };
    expect((await uc.attachmentUrl(ORG, approver, r.id, "approver")).name).toBe(mine.name);
    await expect(uc.attachmentUrl(ORG, RH, r.id, "approver")).rejects.toMatchObject({ code: "not_approver" });
    ctx.users.set("e2", "u-rh");
    await expect(uc.attachmentUrl(ORG, RH, r.id, "owner")).rejects.toThrow("Anexo não encontrado");
    // Na lista de quem não pode ver privadas: só «Anexo», nunca o nome nem o caminho.
    const v = (await uc.myApprovals(ORG, approver, false))[0]!;
    expect(v.attachment).toEqual({ name: "Anexo", mime: "application/pdf" });
    expect(JSON.stringify(v)).not.toContain("absence-attachments");
  });
});

describe("Tipo «Folga» do Portal (ticket 05)", () => {
  test("cria uma vez (tipo FOLGA + fluxo «Chefia direta»), não duplica, e o pedido vai para a chefia direta", async () => {
    const { uc, repo } = setup();
    const first = await uc.ensureDayOffType(ORG, ADMIN);
    expect(first.created).toBe(true);
    expect(first.type).toMatchObject({ name: "Folga", code: "FOLGA", requiresApproval: true, limitAmount: null, hiddenFromEmployee: false });
    const again = await uc.ensureDayOffType(ORG, ADMIN);
    expect(again).toMatchObject({ created: false, type: { id: first.type.id } });
    expect((await repo.listTypes(ORG)).filter((t) => t.code === "FOLGA")).toHaveLength(1);
    expect((await repo.listFlows(ORG)).filter((f) => f.name === "Chefia direta")).toHaveLength(1);
    // e1 tem como chefia u-boss: é quem aprova.
    const r = await uc.createRequest(ORG, EMP, req(first.type.id), "self");
    expect(r.status).toBe("pending");
    expect(r.levels[0]!.approvers).toEqual(["u-boss"]);
  });
});

describe("Tipos do Portal ligado ao Novo RH (Fase 2)", () => {
  test("ensurePortalTypes cria Folga e Falta justificada (privada, anexo opcional) uma vez; portalTypes devolve os ids", async () => {
    const { uc, repo } = setup();
    expect(await uc.portalTypes(ORG)).toEqual({ dayOffTypeId: null, justifiedTypeId: null });
    const first = await uc.ensurePortalTypes(ORG, ADMIN);
    expect(first.created).toEqual(["FOLGA", "FALTA_JUST"]);
    expect(first.justified).toMatchObject({ name: "Falta justificada", code: "FALTA_JUST", private: true, attachment: "optional", requiresApproval: true });
    const again = await uc.ensurePortalTypes(ORG, ADMIN);
    expect(again.created).toEqual([]);
    expect((await repo.listTypes(ORG)).filter((t) => t.code === "FALTA_JUST")).toHaveLength(1);
    expect(await uc.portalTypes(ORG)).toEqual({ dayOffTypeId: first.dayOff.id, justifiedTypeId: first.justified.id });
  });
});
