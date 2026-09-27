import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { DuplicateWorkShiftUseCase } from "../../application/use-cases/duplicate-work-shift.use-case.js";
import { ShiftOverlapError } from "../../domain/errors.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");

function setup() {
  const workShifts = new FakeWorkShiftRepository();
  const employees = new FakeEmployeeRepository();
  const auditLog = new FakeHrAuditLog();
  const useCase = new DuplicateWorkShiftUseCase(workShifts, employees, auditLog);
  const employee = Employee.create({ fullName: "Andres Silva" });
  employees.seed(ORG, employee);
  return { workShifts, employees, auditLog, useCase, employee };
}

describe("DuplicateWorkShiftUseCase", () => {
  it("duplica sempre como rascunho, mesmo que o original esteja publicado", async () => {
    const { useCase, employee, workShifts } = setup();
    const original = WorkShift.create({
      employeeId: employee.id,
      workDate: "2026-08-10",
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
      status: "published",
    });
    workShifts.seed(ORG, original);

    const duplicate = await useCase.execute({
      organizationId: ORG,
      actor: "manager",
      id: original.id,
      targetDate: "2026-08-17",
    });

    expect(duplicate.status).toBe("draft");
    expect(duplicate.workDate).toBe("2026-08-17");
    expect(duplicate.startTime).toBe("09:00");
  });

  it("rejeita quando o dia alvo já tem um turno sobreposto", async () => {
    const { useCase, employee, workShifts } = setup();
    const original = WorkShift.create({
      employeeId: employee.id,
      workDate: "2026-08-10",
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
    });
    const existingOnTarget = WorkShift.create({
      employeeId: employee.id,
      workDate: "2026-08-17",
      startTime: "10:00",
      endTime: "12:00",
      locationId: "loc-1",
    });
    workShifts.seed(ORG, original);
    workShifts.seed(ORG, existingOnTarget);

    await expect(
      useCase.execute({ organizationId: ORG, actor: "manager", id: original.id, targetDate: "2026-08-17" }),
    ).rejects.toThrow(ShiftOverlapError);
  });
});
