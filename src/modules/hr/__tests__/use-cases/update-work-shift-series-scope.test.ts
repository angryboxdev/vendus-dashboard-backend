import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { UpdateWorkShiftSeriesScopeUseCase } from "../../application/use-cases/update-work-shift-series-scope.use-case.js";
import { WorkShiftNotFoundError, WorkShiftNotInSeriesError } from "../../domain/errors.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");
const SERIES_ID = "11111111-1111-1111-1111-111111111111";

function setup() {
  const workShifts = new FakeWorkShiftRepository();
  const employees = new FakeEmployeeRepository();
  const auditLog = new FakeHrAuditLog();
  const useCase = new UpdateWorkShiftSeriesScopeUseCase(workShifts, employees, auditLog);
  const employee = Employee.create({ fullName: "Andres Silva" });
  employees.seed(ORG, employee);
  return { workShifts, employees, auditLog, useCase, employee };
}

/** Semeia uma "semana 1..3" da série: um turno 09:00-17:00 em cada segunda-feira, todos com o mesmo seriesId. */
function seedSeries(workShifts: FakeWorkShiftRepository, employeeId: string) {
  const dates = ["2026-09-28", "2026-10-05", "2026-10-12"];
  const shifts = dates.map((workDate) =>
    WorkShift.create({
      employeeId,
      workDate,
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
      seriesId: SERIES_ID,
      source: "manual",
    }),
  );
  for (const s of shifts) workShifts.seed(ORG, s);
  return shifts;
}

describe("UpdateWorkShiftSeriesScopeUseCase", () => {
  it("only_this: edita e destaca só o turno alvo — os restantes da série ficam intactos", async () => {
    const { useCase, employee, workShifts } = setup();
    const [week1, week2, week3] = seedSeries(workShifts, employee.id);

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      id: week2!.id,
      scope: "only_this",
      startTime: "10:00",
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.startTime).toBe("10:00");
    expect(result[0]!.seriesId).toBeNull();

    const untouched1 = await workShifts.findById(ORG, week1!.id);
    const untouched3 = await workShifts.findById(ORG, week3!.id);
    expect(untouched1!.startTime).toBe("09:00");
    expect(untouched1!.seriesId).toBe(SERIES_ID);
    expect(untouched3!.startTime).toBe("09:00");
    expect(untouched3!.seriesId).toBe(SERIES_ID);
  });

  it("cenário G: whole_series aplica a alteração a todos os turnos da série", async () => {
    const { useCase, employee, workShifts } = setup();
    seedSeries(workShifts, employee.id);

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      id: (await workShifts.findInRange(ORG, { from: "2026-09-28", to: "2026-09-28", employeeId: employee.id }))[0]!.id,
      scope: "whole_series",
      startTime: "10:00",
      endTime: "18:00",
    });

    expect(result).toHaveLength(3);
    expect(result.every((s) => s.startTime === "10:00" && s.endTime === "18:00")).toBe(true);
    expect(result.every((s) => s.seriesId === SERIES_ID)).toBe(true);
  });

  it("this_and_following só afeta os turnos com workDate >= ao turno alvo", async () => {
    const { useCase, employee, workShifts } = setup();
    const [week1] = seedSeries(workShifts, employee.id);
    const target = (await workShifts.findInRange(ORG, { from: "2026-10-05", to: "2026-10-05", employeeId: employee.id }))[0]!;

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      id: target.id,
      scope: "this_and_following",
      startTime: "11:00",
    });

    expect(result).toHaveLength(2);
    expect(result.map((s) => s.workDate).sort()).toEqual(["2026-10-05", "2026-10-12"]);

    const untouchedWeek1 = await workShifts.findById(ORG, week1!.id);
    expect(untouchedWeek1!.startTime).toBe("09:00");
  });

  it("cenário F: uma exceção já destacada (only_this) não é perdida ao editar 'toda a série' depois", async () => {
    const { useCase, employee, workShifts } = setup();
    seedSeries(workShifts, employee.id);
    const week2 = (await workShifts.findInRange(ORG, { from: "2026-10-05", to: "2026-10-05", employeeId: employee.id }))[0]!;

    // Semana 2 é destacada individualmente primeiro (exceção)
    await useCase.execute({ organizationId: ORG, actor: "m", id: week2.id, scope: "only_this", startTime: "10:00" });

    // Depois, "toda a série" é editada a partir de outro turno ainda pertencente à série
    const week1 = (await workShifts.findInRange(ORG, { from: "2026-09-28", to: "2026-09-28", employeeId: employee.id }))[0]!;
    const result = await useCase.execute({ organizationId: ORG, actor: "m", id: week1.id, scope: "whole_series", startTime: "12:00" });

    // A exceção (semana 2, agora sem seriesId) não está entre os afetados
    expect(result).toHaveLength(2);
    expect(result.some((s) => s.workDate === "2026-10-05")).toBe(false);

    const exception = await workShifts.findById(ORG, week2.id);
    expect(exception!.startTime).toBe("10:00");
  });

  it("lança WorkShiftNotInSeriesError quando o turno alvo não pertence a nenhuma série", async () => {
    const { useCase, employee, workShifts } = setup();
    const standalone = WorkShift.create({ employeeId: employee.id, workDate: "2026-09-28", startTime: "09:00", endTime: "17:00", locationId: "loc-1" });
    workShifts.seed(ORG, standalone);

    await expect(
      useCase.execute({ organizationId: ORG, actor: "m", id: standalone.id, scope: "this_and_following", startTime: "10:00" }),
    ).rejects.toThrow(WorkShiftNotInSeriesError);
  });

  it("lança WorkShiftNotFoundError para turno inexistente", async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({ organizationId: ORG, actor: "m", id: "inexistente", scope: "only_this", startTime: "10:00" }),
    ).rejects.toThrow(WorkShiftNotFoundError);
  });
});
