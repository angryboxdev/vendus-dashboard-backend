import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { BaseScheduleTemplate } from "../../domain/entities/base-schedule-template.js";
import { ApplyBaseScheduleUseCase } from "../../application/use-cases/apply-base-schedule.use-case.js";
import { FakeBaseScheduleRepository } from "../fakes/fake-base-schedule-repository.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeHolidayReadAdapter } from "../fakes/fake-holiday-read.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");
// 2026-08-10 é uma segunda-feira.
const MONDAY = "2026-08-10";

function setup() {
  const baseSchedule = new FakeBaseScheduleRepository();
  const workShifts = new FakeWorkShiftRepository();
  const employees = new FakeEmployeeRepository();
  const leaveRead = new FakeLeaveReadAdapter();
  const holidayRead = new FakeHolidayReadAdapter();
  const auditLog = new FakeHrAuditLog();
  const useCase = new ApplyBaseScheduleUseCase(baseSchedule, workShifts, employees, leaveRead, holidayRead, auditLog);
  const employee = Employee.create({ fullName: "Kleiton Carlos" });
  employees.seed(ORG, employee);
  return { baseSchedule, workShifts, employees, leaveRead, holidayRead, auditLog, useCase, employee };
}

describe("ApplyBaseScheduleUseCase", () => {
  it("cria turnos em rascunho para os dias de trabalho da escala base", async () => {
    const { baseSchedule, workShifts, employee, useCase } = setup();
    baseSchedule.seed(
      ORG,
      BaseScheduleTemplate.createWorkingDay({ employeeId: employee.id, weekday: 0, startTime: "08:00", endTime: "17:00", locationId: "loc-1" }),
    );

    const result = await useCase.execute({ organizationId: ORG, actor: "manager", employeeId: employee.id, weekStartDate: MONDAY });

    expect(result.created).toHaveLength(1);
    expect(result.created[0]!.workDate).toBe(MONDAY);
    expect(result.created[0]!.status).toBe("draft");
    expect(result.created[0]!.source).toBe("base_schedule");
    expect(await workShifts.findInRange(ORG, { from: MONDAY, to: MONDAY })).toHaveLength(1);
  });

  it("nunca cria turno num dia marcado como Folga", async () => {
    const { baseSchedule, useCase, employee } = setup();
    baseSchedule.seed(ORG, BaseScheduleTemplate.createDayOff(employee.id, 0));

    const result = await useCase.execute({ organizationId: ORG, actor: "manager", employeeId: employee.id, weekStartDate: MONDAY });

    expect(result.created).toHaveLength(0);
    expect(result.skippedDates).toContain(MONDAY);
  });

  it("salta um dia com feriado, mesmo que a escala base preveja trabalho", async () => {
    const { baseSchedule, holidayRead, useCase, employee } = setup();
    baseSchedule.seed(
      ORG,
      BaseScheduleTemplate.createWorkingDay({ employeeId: employee.id, weekday: 0, startTime: "08:00", endTime: "17:00", locationId: "loc-1" }),
    );
    holidayRead.seed(ORG, { date: MONDAY, name: "Feriado de teste" });

    const result = await useCase.execute({ organizationId: ORG, actor: "manager", employeeId: employee.id, weekStartDate: MONDAY });

    expect(result.created).toHaveLength(0);
    expect(result.skippedDates).toContain(MONDAY);
  });

  it("salta um dia em que o colaborador está de férias/ausência", async () => {
    const { baseSchedule, leaveRead, useCase, employee } = setup();
    baseSchedule.seed(
      ORG,
      BaseScheduleTemplate.createWorkingDay({ employeeId: employee.id, weekday: 0, startTime: "08:00", endTime: "17:00", locationId: "loc-1" }),
    );
    leaveRead.seed(ORG, MONDAY, MONDAY, { employeeId: employee.id, type: "vacation" });

    const result = await useCase.execute({ organizationId: ORG, actor: "manager", employeeId: employee.id, weekStartDate: MONDAY });

    expect(result.created).toHaveLength(0);
    expect(result.skippedDates).toContain(MONDAY);
  });

  it("nunca sobrescreve um turno manual existente sem overrideExceptions", async () => {
    const { baseSchedule, workShifts, useCase, employee } = setup();
    baseSchedule.seed(
      ORG,
      BaseScheduleTemplate.createWorkingDay({ employeeId: employee.id, weekday: 0, startTime: "08:00", endTime: "17:00", locationId: "loc-1" }),
    );
    const manual = WorkShift.create({
      employeeId: employee.id,
      workDate: MONDAY,
      startTime: "10:00",
      endTime: "14:00",
      locationId: "loc-2",
      source: "manual",
    });
    workShifts.seed(ORG, manual);

    const result = await useCase.execute({ organizationId: ORG, actor: "manager", employeeId: employee.id, weekStartDate: MONDAY });

    expect(result.updated).toHaveLength(0);
    expect(result.skippedDates).toContain(MONDAY);
    const stillThere = await workShifts.findById(ORG, manual.id);
    expect(stillThere!.startTime).toBe("10:00");
  });

  it("sobrescreve o turno manual quando overrideExceptions=true", async () => {
    const { baseSchedule, workShifts, useCase, employee } = setup();
    baseSchedule.seed(
      ORG,
      BaseScheduleTemplate.createWorkingDay({ employeeId: employee.id, weekday: 0, startTime: "08:00", endTime: "17:00", locationId: "loc-1" }),
    );
    const manual = WorkShift.create({
      employeeId: employee.id,
      workDate: MONDAY,
      startTime: "10:00",
      endTime: "14:00",
      locationId: "loc-2",
      source: "manual",
    });
    workShifts.seed(ORG, manual);

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "manager",
      employeeId: employee.id,
      weekStartDate: MONDAY,
      overrideExceptions: true,
    });

    expect(result.updated).toHaveLength(1);
    expect(result.updated[0]!.startTime).toBe("08:00");
    expect(result.updated[0]!.source).toBe("base_schedule");
  });

  it("reaplica livremente sobre um turno já gerado pela própria escala base", async () => {
    const { baseSchedule, workShifts, useCase, employee } = setup();
    baseSchedule.seed(
      ORG,
      BaseScheduleTemplate.createWorkingDay({ employeeId: employee.id, weekday: 0, startTime: "09:00", endTime: "18:00", locationId: "loc-1" }),
    );
    const generated = WorkShift.create({
      employeeId: employee.id,
      workDate: MONDAY,
      startTime: "08:00",
      endTime: "17:00",
      locationId: "loc-1",
      source: "base_schedule",
    });
    workShifts.seed(ORG, generated);

    const result = await useCase.execute({ organizationId: ORG, actor: "manager", employeeId: employee.id, weekStartDate: MONDAY });

    expect(result.updated).toHaveLength(1);
    expect(result.updated[0]!.startTime).toBe("09:00");
  });
});
