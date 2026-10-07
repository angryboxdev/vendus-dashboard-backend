import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { ClearWorkShiftsUseCase } from "../../application/use-cases/clear-work-shifts.use-case.js";
import { PreviewClearWorkShiftsUseCase } from "../../application/use-cases/preview-clear-work-shifts.use-case.js";
import { InvalidClearShiftsScopeError } from "../../domain/errors.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");

function shift(employeeId: string, workDate: string, overrides: Partial<Parameters<typeof WorkShift.create>[0]> = {}) {
  return WorkShift.create({ employeeId, workDate, startTime: "09:00", endTime: "17:00", locationId: "loc-1", ...overrides });
}

/** 12 semanas criadas por engano (1 turno/semana) para 2 colaboradores + 1 terceiro que não é tocado. */
function setup() {
  const workShifts = new FakeWorkShiftRepository();
  const auditLog = new FakeHrAuditLog();
  const dates = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, 9, 5 + 7 * i)).toISOString().slice(0, 10));
  for (const d of dates) {
    workShifts.seed(ORG, shift("emp-1", d, { automationId: "auto-1" }));
    workShifts.seed(ORG, shift("emp-2", d, { automationId: "auto-1" }));
    workShifts.seed(ORG, shift("emp-3", d));
  }
  return {
    workShifts,
    auditLog,
    clear: new ClearWorkShiftsUseCase(workShifts, auditLog),
    preview: new PreviewClearWorkShiftsUseCase(workShifts),
    dates,
  };
}

const remainingOf = async (repo: FakeWorkShiftRepository, employeeId: string) =>
  (await repo.findInRange(ORG, { from: "2026-01-01", to: "2027-12-31", employeeId })).length;

describe("Limpar turnos — âmbito 'range' (apagar em massa por período)", () => {
  it("apaga de uma vez as 12 semanas de vários colaboradores, sem tocar nos outros; 1 registo de histórico por colaborador", async () => {
    const { clear, workShifts, auditLog } = setup();

    const result = await clear.execute({
      organizationId: ORG,
      actor: "gestor",
      scope: { kind: "range", from: "2026-10-05", to: "2026-12-27", employeeIds: ["emp-1", "emp-2"] },
    });

    expect(result).toEqual({ deletedCount: 24, skipped: [], undoToken: expect.any(String) });
    expect(await remainingOf(workShifts, "emp-1")).toBe(0);
    expect(await remainingOf(workShifts, "emp-2")).toBe(0);
    expect(await remainingOf(workShifts, "emp-3")).toBe(12);
    expect(auditLog.entries.map((e) => [e.employeeId, e.description])).toEqual([
      ["emp-1", "Turnos apagados em massa de 2026-10-05 a 2026-12-27: 12 turno(s)"],
      ["emp-2", "Turnos apagados em massa de 2026-10-05 a 2026-12-27: 12 turno(s)"],
    ]);
  });

  it("sem lista de colaboradores = todos; preserva turnos com presença registada", async () => {
    const { clear, workShifts, dates } = setup();
    const withAttendance = (await workShifts.findInRange(ORG, { from: dates[0]!, to: dates[0]!, employeeId: "emp-3" }))[0]!;
    workShifts.seedAttendance(withAttendance.id, "worked_as_planned");

    const result = await clear.execute({ organizationId: ORG, actor: "gestor", scope: { kind: "range", from: "2026-10-01", to: "2026-12-31" } });

    expect(result.deletedCount).toBe(35);
    expect(result.skipped).toEqual([{ id: withAttendance.id, workDate: dates[0], reason: "has_attendance" }]);
    expect(await remainingOf(workShifts, "emp-3")).toBe(1);
  });

  it("filtros: só rascunhos e só os gerados por uma automatização", async () => {
    const { clear, workShifts, dates } = setup();
    workShifts.seed(ORG, shift("emp-1", dates[0]!, { automationId: "auto-1", status: "published", startTime: "18:00", endTime: "20:00" }));

    const result = await clear.execute({
      organizationId: ORG,
      actor: "gestor",
      scope: { kind: "range", from: "2026-10-01", to: "2026-12-31", onlyDrafts: true, automationId: "auto-1" },
    });

    expect(result.deletedCount).toBe(24);
    expect(await remainingOf(workShifts, "emp-1")).toBe(1); // o publicado ficou
    expect(await remainingOf(workShifts, "emp-3")).toBe(12); // sem automatização
  });

  it("pré-visualização mostra o mesmo que a confirmação apagaria, por colaborador, sem apagar nada", async () => {
    const { preview, workShifts, dates } = setup();
    const protectedShift = (await workShifts.findInRange(ORG, { from: dates[1]!, to: dates[1]!, employeeId: "emp-1" }))[0]!;
    workShifts.seedAttendance(protectedShift.id, "late");

    const result = await preview.execute({ organizationId: ORG, scope: { kind: "range", from: "2026-10-05", to: "2026-10-31", employeeIds: ["emp-1", "emp-2"] } });

    expect(result).toEqual({
      deletableCount: 7,
      protectedCount: 1,
      byEmployee: [
        { employeeId: "emp-2", deletableCount: 4, protectedCount: 0, firstDate: "2026-10-05", lastDate: "2026-10-26" },
        { employeeId: "emp-1", deletableCount: 3, protectedCount: 1, firstDate: "2026-10-05", lastDate: "2026-10-26" },
      ],
    });
    expect(await remainingOf(workShifts, "emp-1")).toBe(12);
  });

  it.each([
    [{ from: "2026-10-10", to: "2026-10-01" }, /anterior/],
    [{ from: "2026-01-01", to: "2027-01-02" }, /366 dias/],
    [{ from: "10/10/2026", to: "2026-10-11" }, /AAAA-MM-DD/],
    [{ from: "2026-10-01", to: "2026-10-31", employeeIds: [] }, /pelo menos um colaborador/],
  ])("rejeita âmbito inválido %j", async (range, message) => {
    const { clear, workShifts } = setup();
    await expect(clear.execute({ organizationId: ORG, actor: "gestor", scope: { kind: "range", ...range } })).rejects.toThrow(InvalidClearShiftsScopeError);
    await expect(clear.execute({ organizationId: ORG, actor: "gestor", scope: { kind: "range", ...range } })).rejects.toThrow(message);
    expect(await remainingOf(workShifts, "emp-1")).toBe(12);
  });
});
