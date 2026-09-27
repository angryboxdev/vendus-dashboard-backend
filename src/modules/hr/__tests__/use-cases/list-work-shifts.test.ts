import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { ListWorkShiftsUseCase } from "../../application/use-cases/list-work-shifts.use-case.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";

const ORG = mintOrganizationId("org-test");

describe("ListWorkShiftsUseCase", () => {
  it("devolve turnos no intervalo com nome do colaborador e estado de presença", async () => {
    const workShifts = new FakeWorkShiftRepository();
    const employees = new FakeEmployeeRepository();
    const useCase = new ListWorkShiftsUseCase(workShifts, employees);
    const employee = Employee.create({ fullName: "Andres Silva" });
    employees.seed(ORG, employee);

    const shift = WorkShift.create({
      employeeId: employee.id,
      workDate: "2026-08-10",
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
    });
    workShifts.seed(ORG, shift);
    workShifts.seedAttendance(shift.id, "late");

    const result = await useCase.execute({ organizationId: ORG, from: "2026-08-01", to: "2026-08-31" });

    expect(result).toHaveLength(1);
    expect(result[0]!.employeeName).toBe("Andres Silva");
    expect(result[0]!.attendanceStatus).toBe("late");
  });

  it("filtra por employeeId", async () => {
    const workShifts = new FakeWorkShiftRepository();
    const employees = new FakeEmployeeRepository();
    const useCase = new ListWorkShiftsUseCase(workShifts, employees);
    const e1 = Employee.create({ fullName: "A" });
    const e2 = Employee.create({ fullName: "B" });
    employees.seed(ORG, e1);
    employees.seed(ORG, e2);
    workShifts.seed(ORG, WorkShift.create({ employeeId: e1.id, workDate: "2026-08-10", startTime: "09:00", endTime: "17:00", locationId: "loc-1" }));
    workShifts.seed(ORG, WorkShift.create({ employeeId: e2.id, workDate: "2026-08-10", startTime: "09:00", endTime: "17:00", locationId: "loc-1" }));

    const result = await useCase.execute({ organizationId: ORG, from: "2026-08-01", to: "2026-08-31", employeeId: e1.id });

    expect(result).toHaveLength(1);
    expect(result[0]!.employeeName).toBe("A");
  });
});
