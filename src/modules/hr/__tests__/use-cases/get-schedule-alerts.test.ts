import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { BaseScheduleTemplate } from "../../domain/entities/base-schedule-template.js";
import { GetScheduleAlertsUseCase } from "../../application/use-cases/get-schedule-alerts.use-case.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeBaseScheduleRepository } from "../fakes/fake-base-schedule-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeHolidayReadAdapter } from "../fakes/fake-holiday-read.js";

const ORG = mintOrganizationId("org-test");
const MONDAY = "2026-08-10";
const SUNDAY = "2026-08-16";

function setup() {
  const workShifts = new FakeWorkShiftRepository();
  const baseSchedule = new FakeBaseScheduleRepository();
  const employees = new FakeEmployeeRepository();
  const leaveRead = new FakeLeaveReadAdapter();
  const holidayRead = new FakeHolidayReadAdapter();
  const useCase = new GetScheduleAlertsUseCase(workShifts, baseSchedule, employees, leaveRead, holidayRead);
  const employee = Employee.create({ fullName: "Kleiton Carlos" });
  employees.seed(ORG, employee);
  return { workShifts, baseSchedule, employees, leaveRead, holidayRead, useCase, employee };
}

describe("GetScheduleAlertsUseCase", () => {
  it("agrega falta de cobertura, sobreposições e turnos por publicar", async () => {
    const { workShifts, baseSchedule, employee, useCase } = setup();
    baseSchedule.seed(
      ORG,
      BaseScheduleTemplate.createWorkingDay({ employeeId: employee.id, weekday: 0, startTime: "08:00", endTime: "17:00", locationId: "loc-1" }),
    );
    workShifts.seed(
      ORG,
      WorkShift.create({ employeeId: employee.id, workDate: "2026-08-11", startTime: "09:00", endTime: "14:00", locationId: "loc-1" }),
    );
    workShifts.seed(
      ORG,
      WorkShift.create({ employeeId: employee.id, workDate: "2026-08-11", startTime: "13:00", endTime: "18:00", locationId: "loc-1" }),
    );

    const result = await useCase.execute({ organizationId: ORG, from: MONDAY, to: SUNDAY });

    expect(result.coverageGaps).toEqual([
      { employeeId: employee.id, employeeName: "Kleiton Carlos", workDate: MONDAY, locationId: "loc-1" },
    ]);
    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]!.employeeName).toBe("Kleiton Carlos");
    expect(result.pendingPublishCount).toBe(2);
    expect(result.pendingPublishRange).toEqual({ from: MONDAY, to: SUNDAY });
  });

  it("sem turnos em rascunho, pendingPublishRange fica null", async () => {
    const { workShifts, employee, useCase } = setup();
    workShifts.seed(
      ORG,
      WorkShift.create({
        employeeId: employee.id,
        workDate: "2026-08-11",
        startTime: "09:00",
        endTime: "14:00",
        locationId: "loc-1",
        status: "published",
      }),
    );

    const result = await useCase.execute({ organizationId: ORG, from: MONDAY, to: SUNDAY });

    expect(result.pendingPublishCount).toBe(0);
    expect(result.pendingPublishRange).toBeNull();
  });
});
