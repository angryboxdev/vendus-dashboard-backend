import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { ClearWorkShiftsUseCase } from "../../application/use-cases/clear-work-shifts.use-case.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");
const EMPLOYEE_ID = "emp-1";
const SERIES_ID = "22222222-2222-2222-2222-222222222222";

function setup() {
  const workShifts = new FakeWorkShiftRepository();
  const auditLog = new FakeHrAuditLog();
  const useCase = new ClearWorkShiftsUseCase(workShifts, auditLog);
  return { workShifts, auditLog, useCase };
}

function shiftOn(workDate: string, overrides: Partial<Parameters<typeof WorkShift.create>[0]> = {}) {
  return WorkShift.create({ employeeId: EMPLOYEE_ID, workDate, startTime: "09:00", endTime: "17:00", locationId: "loc-1", ...overrides });
}

describe("ClearWorkShiftsUseCase", () => {
  it("scope 'day': apaga só o turno desse dia", async () => {
    const { useCase, workShifts } = setup();
    workShifts.seed(ORG, shiftOn("2026-09-28"));
    workShifts.seed(ORG, shiftOn("2026-09-29"));

    const result = await useCase.execute({ organizationId: ORG, actor: "m", scope: { kind: "day", employeeId: EMPLOYEE_ID, workDate: "2026-09-28" } });

    expect(result.deletedCount).toBe(1);
    expect(result.skipped).toEqual([]);
    const remaining = await workShifts.findInRange(ORG, { from: "2026-01-01", to: "2026-12-31" });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.workDate).toBe("2026-09-29");
  });

  it("scope 'days': apaga só os dias explicitamente indicados", async () => {
    const { useCase, workShifts } = setup();
    workShifts.seed(ORG, shiftOn("2026-09-28"));
    workShifts.seed(ORG, shiftOn("2026-09-30"));
    workShifts.seed(ORG, shiftOn("2026-10-02"));

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      scope: { kind: "days", employeeId: EMPLOYEE_ID, workDates: ["2026-09-28", "2026-10-02"] },
    });

    expect(result.deletedCount).toBe(2);
    const remaining = await workShifts.findInRange(ORG, { from: "2026-01-01", to: "2026-12-31" });
    expect(remaining.map((s) => s.workDate)).toEqual(["2026-09-30"]);
  });

  it("scope 'week': apaga os turnos da semana inteira (7 dias a partir do início indicado)", async () => {
    const { useCase, workShifts } = setup();
    workShifts.seed(ORG, shiftOn("2026-09-28"));
    workShifts.seed(ORG, shiftOn("2026-10-02"));
    workShifts.seed(ORG, shiftOn("2026-10-05")); // fora da semana

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      scope: { kind: "week", employeeId: EMPLOYEE_ID, weekStartDate: "2026-09-28" },
    });

    expect(result.deletedCount).toBe(2);
    const remaining = await workShifts.findInRange(ORG, { from: "2026-01-01", to: "2026-12-31" });
    expect(remaining.map((s) => s.workDate)).toEqual(["2026-10-05"]);
  });

  it("scope 'weeks': apaga as várias semanas indicadas", async () => {
    const { useCase, workShifts } = setup();
    workShifts.seed(ORG, shiftOn("2026-09-28"));
    workShifts.seed(ORG, shiftOn("2026-10-12"));
    workShifts.seed(ORG, shiftOn("2026-10-19")); // semana não pedida

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      scope: { kind: "weeks", employeeId: EMPLOYEE_ID, weekStartDates: ["2026-09-28", "2026-10-12"] },
    });

    expect(result.deletedCount).toBe(2);
    const remaining = await workShifts.findInRange(ORG, { from: "2026-01-01", to: "2026-12-31" });
    expect(remaining.map((s) => s.workDate)).toEqual(["2026-10-19"]);
  });

  it("scope 'series': apaga toda a série pelo seriesId, ignorando turnos avulsos do mesmo colaborador", async () => {
    const { useCase, workShifts } = setup();
    workShifts.seed(ORG, shiftOn("2026-09-28", { seriesId: SERIES_ID }));
    workShifts.seed(ORG, shiftOn("2026-10-05", { seriesId: SERIES_ID }));
    workShifts.seed(ORG, shiftOn("2026-10-12")); // avulso, fora da série

    const result = await useCase.execute({ organizationId: ORG, actor: "m", scope: { kind: "series", seriesId: SERIES_ID } });

    expect(result.deletedCount).toBe(2);
    const remaining = await workShifts.findInRange(ORG, { from: "2026-01-01", to: "2026-12-31" });
    expect(remaining.map((s) => s.workDate)).toEqual(["2026-10-12"]);
  });

  it("cenário H: nunca apaga um turno com presença já registada — salta-o e reporta em skipped, continuando os restantes", async () => {
    const { useCase, workShifts } = setup();
    const withAttendance = shiftOn("2026-09-28");
    const clean = shiftOn("2026-09-29");
    workShifts.seed(ORG, withAttendance);
    workShifts.seed(ORG, clean);
    workShifts.seedAttendance(withAttendance.id, "worked_as_planned");

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      scope: { kind: "days", employeeId: EMPLOYEE_ID, workDates: ["2026-09-28", "2026-09-29"] },
    });

    expect(result.deletedCount).toBe(1);
    expect(result.skipped).toEqual([{ id: withAttendance.id, workDate: "2026-09-28", reason: "has_attendance" }]);
    const remaining = await workShifts.findInRange(ORG, { from: "2026-01-01", to: "2026-12-31" });
    expect(remaining.map((s) => s.workDate)).toEqual(["2026-09-28"]);
  });

  it("scope 'week_all': apaga a semana toda para TODOS os colaboradores, sem filtro de employeeId", async () => {
    const { useCase, workShifts } = setup();
    workShifts.seed(ORG, shiftOn("2026-09-28"));
    workShifts.seed(ORG, WorkShift.create({ employeeId: "emp-2", workDate: "2026-09-29", startTime: "09:00", endTime: "17:00", locationId: "loc-1" }));
    workShifts.seed(ORG, shiftOn("2026-10-05")); // fora da semana

    const result = await useCase.execute({ organizationId: ORG, actor: "m", scope: { kind: "week_all", weekStartDate: "2026-09-28" } });

    expect(result.deletedCount).toBe(2);
    const remaining = await workShifts.findInRange(ORG, { from: "2026-01-01", to: "2026-12-31" });
    expect(remaining.map((s) => s.workDate)).toEqual(["2026-10-05"]);
  });

  it("scope 'week_all' com locationId: só apaga os turnos dessa loja", async () => {
    const { useCase, workShifts } = setup();
    workShifts.seed(ORG, shiftOn("2026-09-28", { locationId: "loc-1" }));
    workShifts.seed(ORG, WorkShift.create({ employeeId: "emp-2", workDate: "2026-09-29", startTime: "09:00", endTime: "17:00", locationId: "loc-2" }));

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      scope: { kind: "week_all", weekStartDate: "2026-09-28", locationId: "loc-1" },
    });

    expect(result.deletedCount).toBe(1);
    const remaining = await workShifts.findInRange(ORG, { from: "2026-01-01", to: "2026-12-31" });
    expect(remaining.map((s) => s.locationId)).toEqual(["loc-2"]);
  });

  it("scope sem turnos correspondentes: deletedCount=0, sem erro", async () => {
    const { useCase } = setup();
    const result = await useCase.execute({ organizationId: ORG, actor: "m", scope: { kind: "day", employeeId: EMPLOYEE_ID, workDate: "2026-09-28" } });
    expect(result).toEqual({ deletedCount: 0, skipped: [], undoToken: null });
  });
});
