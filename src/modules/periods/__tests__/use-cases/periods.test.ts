import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { AttendanceUseCases } from "../../../attendance/application/use-cases/attendance.use-cases.js";
import { FakeAttendanceRepository, FakeAudit, FakeBackground, FakeClockNow, FakeContext } from "../../../attendance/__tests__/fakes/fake-attendance.js";
import { AbsencesUseCases } from "../../../absences/application/use-cases/absences.use-cases.js";
import { FakeAbsencesAudit, FakeAbsencesContext, FakeAbsencesRepository, FakeNotifier, TYPE_BASE } from "../../../absences/__tests__/fakes/fake-absences.js";
import { TimeBankUseCases } from "../../../time-bank/application/use-cases/time-bank.use-cases.js";
import { FakeTimeBankAudit, FakeTimeBankContext, FakeTimeBankRepository } from "../../../time-bank/__tests__/fakes/fake-time-bank.js";
import { PeriodsUseCases } from "../../application/use-cases/periods.use-cases.js";
import { sumTotals } from "../../domain/entities/period.js";
import { payrollCsv } from "../../domain/services/csv-export.js";
import { PeriodForbiddenError } from "../../domain/errors.js";
import { FakePeriodsAudit, FakePeriodsContext, FakePeriodsRepository, FakeSupport, zeroTotals } from "../fakes/fake-periods.js";

const ORG = mintOrganizationId("org-a");
const RH1 = { userId: "u-rh1", email: "rh1@demo.invalid" };
const RH2 = { userId: "u-rh2", email: "rh2@demo.invalid" };
const ADMIN = { userId: "u-admin", email: "admin@demo.invalid" };

function setup() {
  const repo = new FakePeriodsRepository();
  const ctx = new FakePeriodsContext();
  const support = new FakeSupport();
  const uc = new PeriodsUseCases(repo, ctx, support, new FakePeriodsAudit());
  return { repo, ctx, support, uc };
}

async function closedOctober(uc: PeriodsUseCases) {
  const p = await uc.createPeriod(ORG, ADMIN, { scopeType: "organization", scopeId: null, startDate: "2026-10-01", endDate: "2026-10-31" });
  await uc.close(ORG, ADMIN, p.id, null);
  return p;
}

describe("Períodos — fecho e reabertura", () => {
  test("períodos do mesmo âmbito não se sobrepõem; máximo 93 dias", async () => {
    const { uc } = setup();
    await uc.createPeriod(ORG, ADMIN, { scopeType: "organization", scopeId: null, startDate: "2026-10-01", endDate: "2026-10-31" });
    await expect(uc.createPeriod(ORG, ADMIN, { scopeType: "organization", scopeId: null, startDate: "2026-10-15", endDate: "2026-11-14" })).rejects.toMatchObject({ code: "overlap" });
    await expect(uc.createPeriod(ORG, ADMIN, { scopeType: "location", scopeId: "loc-porto", startDate: "2026-10-01", endDate: "2026-10-31" })).resolves.toMatchObject({ status: "open" });
    await expect(uc.createPeriod(ORG, ADMIN, { scopeType: "organization", scopeId: null, startDate: "2027-01-01", endDate: "2027-06-30" })).rejects.toMatchObject({ field: "endDate" });
  });

  test("pré-verificação: com pendentes só fecha com exceção explícita (motivo e lista gravada)", async () => {
    const { uc, ctx, repo } = setup();
    const p = await uc.createPeriod(ORG, ADMIN, { scopeType: "organization", scopeId: null, startDate: "2026-10-01", endDate: "2026-10-31" });
    ctx.pending = [{ type: "incident", id: "i1", employeeId: "e1", date: "2026-10-08", label: "Incidente: missing_out" }];
    await expect(uc.close(ORG, ADMIN, p.id, null)).rejects.toMatchObject({ code: "precheck_failed", pending: ctx.pending });
    const c = await uc.close(ORG, ADMIN, p.id, "Incidente da Ana tratado na folha manual");
    expect(c).toMatchObject({ closureNo: 1, exceptionReason: "Incidente da Ana tratado na folha manual", exceptions: ctx.pending });
    expect(ctx.prepared).toEqual(["e1", "e2"]);
    expect(repo.periods[0]!.status).toBe("closed");
  });

  test("TK_18_reabertura_exige_2_aprovadores_distintos_e_nenhum_e_quem_pediu", async () => {
    const { uc, repo } = setup();
    const p = await closedOctober(uc);
    await expect(uc.requestReopen(ORG, RH1, p.id, " ")).rejects.toMatchObject({ field: "reason" });
    const r = await uc.requestReopen(ORG, RH1, p.id, "Faltou uma baixa médica");
    await expect(uc.requestReopen(ORG, RH2, p.id, "outra")).rejects.toMatchObject({ code: "reopen_pending" });
    await expect(uc.approveReopen(ORG, RH1, r.id)).rejects.toBeInstanceOf(PeriodForbiddenError);
    await uc.approveReopen(ORG, RH2, r.id);
    expect(repo.periods[0]!.status).toBe("closed");
    await expect(uc.approveReopen(ORG, RH2, r.id)).rejects.toMatchObject({ code: "already_approved" });
    const done = await uc.approveReopen(ORG, ADMIN, r.id);
    expect(done?.status).toBe("approved");
    expect(repo.periods[0]!.status).toBe("reopened");
  });

  test("voltar a fechar regista as diferenças face ao fecho anterior", async () => {
    const { uc, ctx } = setup();
    ctx.totalsBy.set("e1", { ...zeroTotals("e1"), workedSeconds: 100 * 3600 });
    const p = await closedOctober(uc);
    const r = await uc.requestReopen(ORG, RH1, p.id, "Correção");
    await uc.approveReopen(ORG, RH2, r.id);
    await uc.approveReopen(ORG, ADMIN, r.id);
    ctx.totalsBy.set("e1", { ...zeroTotals("e1"), workedSeconds: 102 * 3600 });
    const c2 = await uc.close(ORG, ADMIN, p.id, null);
    expect(c2.closureNo).toBe(2);
    expect(c2.diff).toEqual([{ employeeId: "e1", field: "workedSeconds", before: 100 * 3600, after: 102 * 3600 }]);
  });

  test("guarda: datas fechadas por organização ou pelo centro do colaborador", async () => {
    const { uc } = setup();
    const porto = await uc.createPeriod(ORG, ADMIN, { scopeType: "location", scopeId: "loc-porto", startDate: "2026-09-01", endDate: "2026-09-30" });
    await uc.close(ORG, ADMIN, porto.id, null);
    expect([...(await uc.closedDates(ORG, "e1", "2026-09-29", "2026-10-01"))]).toEqual(["2026-09-29", "2026-09-30"]);
    expect((await uc.closedDates(ORG, "e2", "2026-09-29", "2026-10-01")).size).toBe(0);
    await closedOctober(uc);
    expect((await uc.closedDates(ORG, "e2", "2026-10-31", "2026-11-01")).has("2026-10-31")).toBe(true);
  });
});

describe("Períodos — TK-17 e RE-30 nos outros módulos", () => {
  test("RE_30_TK_17_correcao_de_marcacao_ausencia_e_banco_recusadas_com_periodo_fechado_e_permitidas_apos_reabertura", async () => {
    const { uc } = setup();
    const guard = { closedDates: (o: typeof ORG, e: string, f: string, t: string) => uc.closedDates(o, e, f, t) };
    // Assiduidade
    const attRepo = new FakeAttendanceRepository();
    const clock = new FakeClockNow("2026-11-02T10:00:00.000Z");
    const attendance = new AttendanceUseCases(attRepo, new FakeContext(), new FakeAudit(), clock, new FakeBackground(), guard);
    // Ausências
    const absences = new AbsencesUseCases(new FakeAbsencesRepository(), new FakeAbsencesContext(), new FakeNotifier(), new FakeAbsencesAudit(), { today: async () => "2026-11-02" }, guard);
    const type = await absences.createType(ORG, ADMIN, { ...TYPE_BASE, requiresApproval: false });
    // Banco de horas
    const bank = new TimeBankUseCases(new FakeTimeBankRepository(), new FakeTimeBankContext(), new FakeTimeBankAudit(), guard);

    const p = await closedOctober(uc);
    const revise = () => attendance.revise(ORG, { userId: "u-boss", email: "gestora" }, "e1", { operation: "add", targetEventId: null, occurredAt: "2026-10-20T08:00:00.000Z", segmentType: "work", reason: "Esqueceu-se" });
    await expect(revise()).rejects.toMatchObject({ code: "period_closed" });
    await expect(absences.createRequest(ORG, { userId: "u-boss", email: "gestora" }, { employeeId: "e1", typeId: type.id, startDate: "2026-10-20", endDate: "2026-10-20", startTime: null, endTime: null, halfDay: false, comment: null, attachmentDocumentId: null }, "assign")).rejects.toMatchObject({ code: "period_closed" });
    await expect(bank.adjust(ORG, { userId: "u-boss", email: "gestora" }, "e1", { seconds: 3600, workDate: "2026-10-20", reason: "x" })).rejects.toMatchObject({ code: "period_closed" });

    // Reabertura com dupla aprovação → a correção passa e fica auditada.
    const r = await uc.requestReopen(ORG, RH1, p.id, "Correção de marcação");
    await uc.approveReopen(ORG, RH2, r.id);
    await uc.approveReopen(ORG, ADMIN, r.id);
    await expect(revise()).resolves.toMatchObject({ reason: "Esqueceu-se" });
  });

  test("dias de períodos fechados ficam congelados no recálculo da assiduidade", async () => {
    const { uc } = setup();
    const guard = { closedDates: (o: typeof ORG, e: string, f: string, t: string) => uc.closedDates(o, e, f, t) };
    const attRepo = new FakeAttendanceRepository();
    const attendance = new AttendanceUseCases(attRepo, new FakeContext(), new FakeAudit(), new FakeClockNow("2026-11-02T10:00:00.000Z"), new FakeBackground(), guard);
    await closedOctober(uc);
    await attendance.recalculate(ORG, "e1", "2026-10-30", "2026-11-01", "x");
    expect(attRepo.days.map((d) => d.workDate)).toEqual(["2026-11-01"]);
  });
});

describe("Exportações (TK-19)", () => {
  test("TK_19_totais_exportados_conferem_com_a_soma_dos_dias_e_movimentos", async () => {
    const { uc, ctx, support, repo } = setup();
    ctx.totalsBy.set("e1", { ...zeroTotals("e1"), workedSeconds: 160 * 3600, theoreticalSeconds: 168 * 3600, excessSeconds: -8 * 3600, bankSeconds: -8 * 3600, absences: [{ typeId: "t1", typeName: "Férias", code: "FER", unit: "days", amount: 2 }], byLocation: [{ locationId: "loc-porto", workedSeconds: 160 * 3600 }] });
    ctx.totalsBy.set("e2", { ...zeroTotals("e2"), workedSeconds: 170 * 3600, theoreticalSeconds: 168 * 3600, excessSeconds: 2 * 3600, bankSeconds: 2 * 3600, bankPaidSeconds: 3600, byLocation: [{ locationId: "loc-lisboa", workedSeconds: 170 * 3600 }] });
    const p = await uc.createPeriod(ORG, ADMIN, { scopeType: "organization", scopeId: null, startDate: "2026-10-01", endDate: "2026-10-31" });
    await expect(uc.requestExport(ORG, RH1, p.id, "payroll", false)).rejects.toMatchObject({ code: "invalid_state" });
    const closure = await uc.close(ORG, ADMIN, p.id, null);
    const job = await uc.requestExport(ORG, RH1, p.id, "payroll", false);
    expect(job.status).toBe("queued");
    await support.flush();
    const done = repo.exports[0]!;
    expect(done.status).toBe("done");
    expect(done.totals).toEqual(sumTotals(closure.totals));
    expect(done.totals).toMatchObject({ workedSeconds: 330 * 3600, excessSeconds: -6 * 3600, bankSeconds: -6 * 3600, bankPaidSeconds: 3600 });
    // O ficheiro: sem NIF (sem permissão), totais de horas em decimal com vírgula, fórmulas neutralizadas.
    const file = await uc.download(ORG, RH1, job.id, "tok-123");
    expect(file.fileName).toBe("salarios_2026-10-01_2026-10-31.csv");
    expect(file.content.startsWith("﻿")).toBe(true);
    expect(file.content).not.toContain("123456789");
    expect(file.content).toContain("ausencia_FER_dias");
    expect(file.content).toContain("160,00");
    // Um nome que começa por "=" fica neutralizado (sem fórmula) e entre aspas por ter ";".
    expect(file.content).toContain(`"'=Bruno;Teste"`);
    const cells = (line: string) => [...line.matchAll(/("(?:[^"]|"")*"|[^;]*)(?:;|$)/g)].map((m) => m[1]!).slice(0, -1);
    const rows = file.content.replace("﻿", "").trim().split("\r\n").map(cells);
    const col = rows[0]!.indexOf("horas_trabalhadas");
    const csvSum = rows.slice(1).reduce((s, r) => s + Number(r[col]!.replace(",", ".")), 0);
    expect(csvSum).toBeCloseTo(330, 2);
  });

  test("link que expira em 24 h e só para quem pediu", async () => {
    const { uc, support } = setup();
    const p = await closedOctober(uc);
    const job = await uc.requestExport(ORG, RH1, p.id, "billing_location", false);
    await support.flush();
    await expect(uc.download(ORG, RH2, job.id, "tok-123")).rejects.toThrow("não encontrado");
    await expect(uc.download(ORG, RH1, job.id, "errado")).rejects.toThrow("não encontrado");
    support.nowValue = "2026-11-03T10:00:01.000Z";
    await expect(uc.download(ORG, RH1, job.id, "tok-123")).rejects.toMatchObject({ code: "expired" });
  });

  test("NIF só com a permissão de dados sensíveis", () => {
    const csv = payrollCsv({ startDate: "2026-10-01", endDate: "2026-10-31" }, [zeroTotals("e1")], [{ employeeId: "e1", name: "Ana", nif: "123456789" }], true);
    expect(csv.split("\r\n")[0]).toContain(";nif;");
    expect(csv).toContain("123456789");
  });
});
