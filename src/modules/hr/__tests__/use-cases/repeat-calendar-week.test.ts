import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { RepeatCalendarWeekUseCase } from "../../application/use-cases/repeat-calendar-week.use-case.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeHolidayReadAdapter } from "../fakes/fake-holiday-read.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");
const SOURCE_MONDAY = "2026-09-28";
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function setup() {
  const workShifts = new FakeWorkShiftRepository();
  const employees = new FakeEmployeeRepository();
  const leaveRead = new FakeLeaveReadAdapter();
  const holidayRead = new FakeHolidayReadAdapter();
  const auditLog = new FakeHrAuditLog();
  const useCase = new RepeatCalendarWeekUseCase(workShifts, employees, leaveRead, holidayRead, auditLog);
  return { workShifts, employees, leaveRead, holidayRead, auditLog, useCase };
}

function seedTwoEmployeeWeek(workShifts: FakeWorkShiftRepository, carlosId: string, gabrielId: string) {
  for (const workDate of ["2026-09-28", "2026-09-29", "2026-10-01", "2026-10-02"]) {
    workShifts.seed(ORG, WorkShift.create({ employeeId: carlosId, workDate, startTime: "09:00", endTime: "17:00", locationId: "loc-1" }));
  }
  for (const workDate of ["2026-09-28", "2026-09-30", "2026-10-01"]) {
    workShifts.seed(ORG, WorkShift.create({ employeeId: gabrielId, workDate, startTime: "15:00", endTime: "23:00", locationId: "loc-1" }));
  }
  workShifts.seed(ORG, WorkShift.create({ employeeId: gabrielId, workDate: "2026-10-03", startTime: "12:00", endTime: "20:00", locationId: "loc-1" }));
}

describe("RepeatCalendarWeekUseCase", () => {
  it("cria os turnos das 4 semanas seguintes para os 2 colaboradores, cada um com o seu seriesId", async () => {
    const { workShifts, employees, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    const gabriel = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, carlos);
    employees.seed(ORG, gabriel);
    seedTwoEmployeeWeek(workShifts, carlos.id, gabriel.id);

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "manager@angrybox.com",
      sourceWeekStartDate: SOURCE_MONDAY,
      weekdays: [...ALL_WEEKDAYS],
      repeat: { kind: "weeks", weeks: 4 },
      publish: false,
    });

    expect(result.totalCreated).toBe(32);
    expect(result.totalConflicts).toBe(0);
    const carlosResult = result.employees.find((e) => e.employeeId === carlos.id)!;
    const gabrielResult = result.employees.find((e) => e.employeeId === gabriel.id)!;
    expect(carlosResult.created).toHaveLength(16);
    expect(gabrielResult.created).toHaveLength(16);
    // cada colaborador tem o seu próprio seriesId, nunca partilhado entre colaboradores
    const carlosSeriesIds = new Set(carlosResult.created.map((s) => s.seriesId));
    const gabrielSeriesIds = new Set(gabrielResult.created.map((s) => s.seriesId));
    expect(carlosSeriesIds.size).toBe(1);
    expect(gabrielSeriesIds.size).toBe(1);
    expect([...carlosSeriesIds][0]).not.toBe([...gabrielSeriesIds][0]);
    expect(carlosResult.created.every((s) => s.status === "draft")).toBe(true);

    const allShifts = await workShifts.findInRange(ORG, { from: "2026-01-01", to: "2026-12-31" });
    expect(allShifts).toHaveLength(8 /* origem */ + 32 /* novos */);
  });

  it("publish=true cria já publicados", async () => {
    const { workShifts, employees, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, carlos);
    for (const workDate of ["2026-09-28"]) {
      workShifts.seed(ORG, WorkShift.create({ employeeId: carlos.id, workDate, startTime: "09:00", endTime: "17:00", locationId: "loc-1" }));
    }

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      sourceWeekStartDate: SOURCE_MONDAY,
      weekdays: [0],
      repeat: { kind: "weeks", weeks: 1 },
      publish: true,
    });

    expect(result.employees[0]!.created[0]!.status).toBe("published");
  });

  it("sem force: turno em conflito não é criado, fica reportado em conflicts", async () => {
    const { workShifts, employees, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, carlos);
    workShifts.seed(ORG, WorkShift.create({ employeeId: carlos.id, workDate: "2026-09-28", startTime: "09:00", endTime: "17:00", locationId: "loc-1" }));
    workShifts.seed(ORG, WorkShift.create({ employeeId: carlos.id, workDate: "2026-10-05", startTime: "10:00", endTime: "18:00", locationId: "loc-1" }));

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      sourceWeekStartDate: SOURCE_MONDAY,
      weekdays: [0],
      repeat: { kind: "weeks", weeks: 2 },
      publish: false,
    });

    expect(result.employees[0]!.created).toHaveLength(1);
    expect(result.employees[0]!.created[0]!.workDate).toBe("2026-10-12");
    expect(result.employees[0]!.conflicts).toHaveLength(1);
  });

  it("com force: cria também as ocorrências em conflito", async () => {
    const { workShifts, employees, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, carlos);
    workShifts.seed(ORG, WorkShift.create({ employeeId: carlos.id, workDate: "2026-09-28", startTime: "09:00", endTime: "17:00", locationId: "loc-1" }));
    workShifts.seed(ORG, WorkShift.create({ employeeId: carlos.id, workDate: "2026-10-05", startTime: "10:00", endTime: "18:00", locationId: "loc-1" }));

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      sourceWeekStartDate: SOURCE_MONDAY,
      weekdays: [0],
      repeat: { kind: "weeks", weeks: 1 },
      publish: false,
      force: true,
    });

    expect(result.employees[0]!.created).toHaveLength(1);
    expect(result.employees[0]!.conflicts).toHaveLength(0);
  });

  it("preserva turno repartido/noturno ao repetir", async () => {
    const { workShifts, employees, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, carlos);
    workShifts.seed(
      ORG,
      WorkShift.create({
        employeeId: carlos.id,
        workDate: "2026-09-28",
        startTime: "12:00",
        endTime: "16:00",
        secondStartTime: "19:00",
        secondEndTime: "23:00",
        locationId: "loc-1",
      }),
    );

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      sourceWeekStartDate: SOURCE_MONDAY,
      weekdays: [0],
      repeat: { kind: "weeks", weeks: 1 },
      publish: false,
    });

    expect(result.employees[0]!.created[0]!.secondStartTime).toBe("19:00");
    expect(result.employees[0]!.created[0]!.secondEndTime).toBe("23:00");
  });

  it("rotateEmployees: cria os turnos trocados entre os 2 colaboradores", async () => {
    const { workShifts, employees, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    const gabriel = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, carlos);
    employees.seed(ORG, gabriel);
    seedTwoEmployeeWeek(workShifts, carlos.id, gabriel.id);

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "manager@angrybox.com",
      sourceWeekStartDate: SOURCE_MONDAY,
      weekdays: [...ALL_WEEKDAYS],
      employeeIds: [carlos.id, gabriel.id],
      rotateEmployees: true,
      repeat: { kind: "weeks", weeks: 1 },
      publish: false,
    });

    const carlosResult = result.employees.find((e) => e.employeeId === carlos.id)!;
    const gabrielResult = result.employees.find((e) => e.employeeId === gabriel.id)!;
    expect(carlosResult.created.every((s) => s.startTime === "15:00" || s.startTime === "12:00")).toBe(true);
    expect(gabrielResult.created.every((s) => s.startTime === "09:00")).toBe(true);
  });

  it("regista 1 entrada de auditoria por colaborador afetado", async () => {
    const { workShifts, employees, auditLog, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    const gabriel = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, carlos);
    employees.seed(ORG, gabriel);
    seedTwoEmployeeWeek(workShifts, carlos.id, gabriel.id);

    await useCase.execute({
      organizationId: ORG,
      actor: "manager@angrybox.com",
      sourceWeekStartDate: SOURCE_MONDAY,
      weekdays: [...ALL_WEEKDAYS],
      repeat: { kind: "weeks", weeks: 1 },
      publish: false,
    });

    expect(auditLog.entries.filter((e) => e.employeeId === carlos.id)).toHaveLength(1);
    expect(auditLog.entries.filter((e) => e.employeeId === gabriel.id)).toHaveLength(1);
  });
});
