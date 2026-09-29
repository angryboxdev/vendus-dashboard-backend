import { DateTime } from "luxon";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { Location } from "../../../locations/domain/entities/location.js";
import { GetShiftToReviewUseCase } from "../../application/use-cases/get-shift-to-review.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeShiftAttendanceReadAdapter } from "../fakes/fake-shift-attendance-read.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import type { ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";

const ORG = mintOrganizationId("org-test");
const TODAY = DateTime.now().setZone("Europe/Lisbon").toISODate()!;

function makeShift(overrides: Partial<ShiftOccurrence> = {}): ShiftOccurrence {
  return {
    shiftId: "s1",
    employeeId: "e1",
    workDate: TODAY,
    startTime: "09:00",
    endTime: "10:00",
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

function setup() {
  const employees = new FakeEmployeeRepository();
  const shifts = new FakeShiftAttendanceReadAdapter();
  const locations = new FakeLocationRepository();
  const useCase = new GetShiftToReviewUseCase(employees, shifts, locations);
  return { employees, shifts, locations, useCase };
}

describe("GetShiftToReviewUseCase", () => {
  it("devolve o turno com nome do colaborador e nome do local resolvidos", async () => {
    const { employees, shifts, locations, useCase } = setup();
    const emp = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, emp);
    locations.seed(ORG, [Location.reconstitute({ id: "loc1", name: "Loja MBS", code: "MBS", timezone: "Europe/Lisbon", isActive: true })]);
    const past = DateTime.now().setZone("Europe/Lisbon").minus({ hours: 3 });
    shifts.seed(
      ORG,
      makeShift({
        shiftId: "shift-1",
        employeeId: emp.id,
        startTime: past.toFormat("HH:mm"),
        endTime: past.plus({ minutes: 30 }).toFormat("HH:mm"),
      }),
    );

    const result = await useCase.execute({ organizationId: ORG, shiftId: "shift-1" });
    expect(result).not.toBeNull();
    expect(result!.employeeName).toBe("Carlos Andrés");
    expect(result!.locationName).toBe("Loja MBS");
    expect(result!.exceptionLabel).toBe("Por conferir");
  });

  it("devolve null para um turno inexistente", async () => {
    const { useCase } = setup();
    const result = await useCase.execute({ organizationId: ORG, shiftId: "inexistente" });
    expect(result).toBeNull();
  });

  it("devolve null quando o turno já não precisa de conferência (ex: já conferido)", async () => {
    const { employees, shifts, useCase } = setup();
    const emp = Employee.create({ fullName: "João Victor" });
    employees.seed(ORG, emp);
    const past = DateTime.now().setZone("Europe/Lisbon").minus({ hours: 3 });
    shifts.seed(
      ORG,
      makeShift({
        shiftId: "shift-2",
        employeeId: emp.id,
        startTime: past.toFormat("HH:mm"),
        endTime: past.plus({ minutes: 30 }).toFormat("HH:mm"),
        actualStartTime: past.toFormat("HH:mm"),
        actualEndTime: past.plus({ minutes: 35 }).toFormat("HH:mm"),
      }),
    );

    const result = await useCase.execute({ organizationId: ORG, shiftId: "shift-2" });
    expect(result).toBeNull();
  });
});
