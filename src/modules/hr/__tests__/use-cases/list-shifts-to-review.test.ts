import { DateTime } from "luxon";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { ListShiftsToReviewUseCase } from "../../application/use-cases/list-shifts-to-review.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeShiftAttendanceReadAdapter } from "../fakes/fake-shift-attendance-read.js";
import type { ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";

const ORG = mintOrganizationId("org-test");
const TODAY = DateTime.now().setZone("Europe/Lisbon").toISODate()!;
const YESTERDAY = DateTime.now().setZone("Europe/Lisbon").minus({ days: 1 }).toISODate()!;

function makeShift(overrides: Partial<ShiftOccurrence> = {}): ShiftOccurrence {
  return {
    shiftId: "s1",
    employeeId: "e1",
    workDate: YESTERDAY,
    startTime: "09:00",
    endTime: "17:00",
    locationId: "loc1",
    attendanceStatus: null,
    actualStartTime: null,
    actualEndTime: null,
    lateMinutes: null,
    ...overrides,
  };
}

describe("ListShiftsToReviewUseCase", () => {
  it("só devolve turnos que precisam de conferência, com nome do colaborador resolvido", async () => {
    const employees = new FakeEmployeeRepository();
    const shifts = new FakeShiftAttendanceReadAdapter();
    const e = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, e);
    shifts.seed(ORG, makeShift({ employeeId: e.id })); // ontem, sem conferência → precisa
    shifts.seed(
      ORG,
      makeShift({ shiftId: "s2", employeeId: e.id, workDate: TODAY, startTime: "09:00", endTime: "23:59" }),
    ); // hoje, ainda a decorrer → não precisa

    const useCase = new ListShiftsToReviewUseCase(employees, shifts);
    const result = await useCase.execute({ organizationId: ORG, page: 1, pageSize: 10 });

    expect(result.total).toBe(1);
    expect(result.items[0]!.employeeName).toBe("Gabriel Gomes");
  });

  it("filtra por prioridade e devolve contagens por prioridade sobre o conjunto completo (não só a página filtrada)", async () => {
    const employees = new FakeEmployeeRepository();
    const shifts = new FakeShiftAttendanceReadAdapter();
    const e = Employee.create({ fullName: "Ana Costa" });
    employees.seed(ORG, e);
    shifts.seed(ORG, makeShift({ shiftId: "s1", employeeId: e.id, actualStartTime: "09:00" })); // sem saída → ALTA
    shifts.seed(ORG, makeShift({ shiftId: "s2", employeeId: e.id })); // sem nada → BAIXA

    const useCase = new ListShiftsToReviewUseCase(employees, shifts);
    const all = await useCase.execute({ organizationId: ORG, page: 1, pageSize: 10 });
    expect(all.countsByPriority.ALTA).toBe(1);
    expect(all.countsByPriority.BAIXA).toBe(1);

    const onlyAlta = await useCase.execute({ organizationId: ORG, priority: "ALTA", page: 1, pageSize: 10 });
    expect(onlyAlta.total).toBe(1);
    expect(onlyAlta.countsByPriority.BAIXA).toBe(1); // contagens continuam completas, não filtradas
  });

  it("pesquisa por nome (case-insensitive)", async () => {
    const employees = new FakeEmployeeRepository();
    const shifts = new FakeShiftAttendanceReadAdapter();
    const e1 = Employee.create({ fullName: "Gabriel Gomes" });
    const e2 = Employee.create({ fullName: "Ana Costa" });
    employees.seed(ORG, e1);
    employees.seed(ORG, e2);
    shifts.seed(ORG, makeShift({ shiftId: "s1", employeeId: e1.id }));
    shifts.seed(ORG, makeShift({ shiftId: "s2", employeeId: e2.id }));

    const useCase = new ListShiftsToReviewUseCase(employees, shifts);
    const result = await useCase.execute({ organizationId: ORG, search: "gabriel", page: 1, pageSize: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.employeeName).toBe("Gabriel Gomes");
  });

  it("nunca inclui turnos cancelados", async () => {
    const employees = new FakeEmployeeRepository();
    const shifts = new FakeShiftAttendanceReadAdapter();
    const e = Employee.create({ fullName: "Pedro Almeida" });
    employees.seed(ORG, e);
    shifts.seed(ORG, makeShift({ employeeId: e.id, attendanceStatus: "cancelled" }));

    const useCase = new ListShiftsToReviewUseCase(employees, shifts);
    const result = await useCase.execute({ organizationId: ORG, page: 1, pageSize: 10 });
    expect(result.total).toBe(0);
  });
});
