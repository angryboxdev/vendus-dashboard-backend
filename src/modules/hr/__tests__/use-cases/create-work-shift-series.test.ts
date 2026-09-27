import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { CreateWorkShiftSeriesUseCase } from "../../application/use-cases/create-work-shift-series.use-case.js";
import { EmployeeNotFoundError } from "../../domain/errors.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeHolidayReadAdapter } from "../fakes/fake-holiday-read.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");
const MORNING = [{ startTime: "09:00", endTime: "17:00" }];

function setup() {
  const workShifts = new FakeWorkShiftRepository();
  const employees = new FakeEmployeeRepository();
  const leaveRead = new FakeLeaveReadAdapter();
  const holidayRead = new FakeHolidayReadAdapter();
  const auditLog = new FakeHrAuditLog();
  const useCase = new CreateWorkShiftSeriesUseCase(workShifts, employees, leaveRead, holidayRead, auditLog);
  const employee = Employee.create({ fullName: "Andres Silva" });
  employees.seed(ORG, employee);
  return { workShifts, employees, leaveRead, holidayRead, auditLog, useCase, employee };
}

describe("CreateWorkShiftSeriesUseCase", () => {
  it("cenário B: 3x/semana durante 4 semanas → cria 12 turnos com o mesmo seriesId", async () => {
    const { useCase, employee, workShifts } = setup();
    const result = await useCase.execute({
      organizationId: ORG,
      actor: "manager@angrybox.com",
      employeeId: employee.id,
      locationId: "loc-1",
      startDate: "2026-09-28",
      rules: [{ weekdays: [0, 2, 4], segments: MORNING }],
      repeat: { kind: "weeks", weeks: 4 },
      publish: false,
    });
    expect(result.created).toHaveLength(12);
    expect(result.seriesId).not.toBeNull();
    expect(result.created.every((s) => s.seriesId === result.seriesId)).toBe(true);
    expect(result.created.every((s) => s.status === "draft")).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.skipped).toEqual([]);

    const all = await workShifts.findInRange(ORG, { from: "2026-01-01", to: "2026-12-31" });
    expect(all).toHaveLength(12);
  });

  it("publish=true cria já publicados", async () => {
    const { useCase, employee } = setup();
    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      employeeId: employee.id,
      locationId: "loc-1",
      startDate: "2026-09-28",
      rules: [{ weekdays: [0], segments: MORNING }],
      repeat: { kind: "none" },
      publish: true,
    });
    expect(result.created[0]!.status).toBe("published");
  });

  it("1 única ocorrência não forma série — seriesId fica null", async () => {
    const { useCase, employee } = setup();
    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      employeeId: employee.id,
      locationId: "loc-1",
      startDate: "2026-09-28",
      rules: [{ weekdays: [0], segments: MORNING }],
      repeat: { kind: "none" },
      publish: false,
    });
    expect(result.created).toHaveLength(1);
    expect(result.seriesId).toBeNull();
    expect(result.created[0]!.seriesId).toBeNull();
  });

  it("sem force: turno em conflito não é criado, é reportado em conflicts", async () => {
    const { useCase, employee, workShifts } = setup();
    workShifts.seed(
      ORG,
      WorkShift.create({ employeeId: employee.id, workDate: "2026-09-28", startTime: "09:00", endTime: "17:00", locationId: "loc-1" }),
    );

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      employeeId: employee.id,
      locationId: "loc-1",
      startDate: "2026-09-28",
      rules: [{ weekdays: [0], segments: MORNING }],
      repeat: { kind: "weeks", weeks: 2 },
      publish: false,
    });
    expect(result.created).toHaveLength(1);
    expect(result.created[0]!.workDate).toBe("2026-10-05");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.workDate).toBe("2026-09-28");
  });

  it("com force: cria também as ocorrências em conflito, mas nunca as de férias/feriado", async () => {
    const { useCase, employee, workShifts, leaveRead, holidayRead } = setup();
    workShifts.seed(
      ORG,
      WorkShift.create({ employeeId: employee.id, workDate: "2026-09-28", startTime: "09:00", endTime: "17:00", locationId: "loc-1" }),
    );
    leaveRead.seed(ORG, "2026-10-05", "2026-10-05", { employeeId: employee.id, type: "vacation" });
    holidayRead.seed(ORG, { date: "2026-10-12", name: "Feriado de teste" });

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      employeeId: employee.id,
      locationId: "loc-1",
      startDate: "2026-09-28",
      rules: [{ weekdays: [0], segments: MORNING }],
      repeat: { kind: "weeks", weeks: 3 },
      publish: false,
      force: true,
    });
    // 09-28 (conflito, forçado), 10-05 (férias, nunca criado), 10-12 (feriado, nunca criado)
    expect(result.created).toHaveLength(1);
    expect(result.created[0]!.workDate).toBe("2026-09-28");
    expect(result.conflicts).toEqual([]);
    expect(result.skipped).toHaveLength(2);
  });

  it("lança EmployeeNotFoundError para colaborador inexistente", async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({
        organizationId: ORG,
        actor: "m",
        employeeId: "inexistente",
        locationId: "loc-1",
        startDate: "2026-09-28",
        rules: [{ weekdays: [0], segments: MORNING }],
        repeat: { kind: "none" },
        publish: false,
      }),
    ).rejects.toThrow(EmployeeNotFoundError);
  });

  it("turno repartido: os 2 segmentos ficam gravados no turno criado", async () => {
    const { useCase, employee } = setup();
    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      employeeId: employee.id,
      locationId: "loc-1",
      startDate: "2026-09-28",
      rules: [
        {
          weekdays: [0],
          segments: [
            { startTime: "09:00", endTime: "13:00" },
            { startTime: "15:00", endTime: "19:00" },
          ],
        },
      ],
      repeat: { kind: "none" },
      publish: false,
    });
    expect(result.created[0]!.secondStartTime).toBe("15:00");
    expect(result.created[0]!.secondEndTime).toBe("19:00");
  });
});
