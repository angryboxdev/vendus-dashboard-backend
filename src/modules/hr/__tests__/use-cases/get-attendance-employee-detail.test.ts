import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { GetAttendanceEmployeeDetailUseCase } from "../../application/use-cases/get-attendance-employee-detail.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeShiftAttendanceReadAdapter } from "../fakes/fake-shift-attendance-read.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import { FakeAttendanceRulesRepository } from "../fakes/fake-attendance-rules-repository.js";
import { FakeAttendanceCorrectionRepository } from "../fakes/fake-attendance-correction-repository.js";
import type { ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";

const ORG = mintOrganizationId("org-test");

function shift(overrides: Partial<ShiftOccurrence> = {}): ShiftOccurrence {
  return {
    shiftId: "s1",
    employeeId: "e1",
    workDate: "2026-09-05",
    startTime: "09:00",
    endTime: "17:00",
    endsNextDay: false,
    secondStartTime: null,
    secondEndTime: null,
    locationId: "loc1",
    attendanceStatus: null,
    actualStartTime: null,
    actualEndTime: null,
    lateMinutes: null,
    ...overrides,
  };
}

function makeUseCase() {
  const employees = new FakeEmployeeRepository();
  const shifts = new FakeShiftAttendanceReadAdapter();
  const leave = new FakeLeaveReadAdapter();
  const locations = new FakeLocationRepository();
  const attendanceRules = new FakeAttendanceRulesRepository();
  const attendanceCorrections = new FakeAttendanceCorrectionRepository();
  return {
    employees,
    shifts,
    useCase: new GetAttendanceEmployeeDetailUseCase(employees, shifts, leave, locations, attendanceRules, attendanceCorrections),
  };
}

describe("GetAttendanceEmployeeDetailUseCase", () => {
  it("null quando o colaborador não existe", async () => {
    const { useCase } = makeUseCase();
    const result = await useCase.execute({ organizationId: ORG, employeeId: "nao-existe", year: 2026, month: 9 });
    expect(result).toBeNull();
  });

  it("extrato diário mostra turnos Regulares (nunca pula, ao contrário da Conferência)", async () => {
    const { employees, shifts, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, emp);
    shifts.seed(ORG, shift({ shiftId: "s1", employeeId: emp.id, workDate: "2026-09-05", actualStartTime: "09:00", actualEndTime: "17:00" }));

    const result = await useCase.execute({ organizationId: ORG, employeeId: emp.id, year: 2026, month: 9 });

    expect(result?.rows).toHaveLength(1);
    expect(result?.rows[0]!.state).toBe("REGULAR");
    expect(result?.rows[0]!.occurrenceLabel).toBe("Regular");
    expect(result?.rows[0]!.reviewStatus).toBe("conferred");
    expect(result?.kpis.pendingCount).toBe(0);
  });

  it("dia com atraso conta para pendências/dias em atraso, mas continua na mesma lista", async () => {
    const { employees, shifts, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, emp);
    shifts.seed(ORG, shift({ shiftId: "s1", employeeId: emp.id, workDate: "2026-09-05", actualStartTime: "09:18", actualEndTime: "17:00" }));
    shifts.seed(ORG, shift({ shiftId: "s2", employeeId: emp.id, workDate: "2026-09-06", actualStartTime: "09:00", actualEndTime: "17:00" }));

    const result = await useCase.execute({ organizationId: ORG, employeeId: emp.id, year: 2026, month: 9 });

    expect(result?.rows).toHaveLength(2);
    expect(result?.kpis.plannedShiftsCount).toBe(2);
    expect(result?.kpis.pendingCount).toBe(1);
    expect(result?.kpis.lateDaysCount).toBe(1);
    expect(result?.kpis.lateMinutesTotal).toBe(18);
  });
});
