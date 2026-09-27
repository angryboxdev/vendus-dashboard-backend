import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { UpdateWorkShiftUseCase } from "../../application/use-cases/update-work-shift.use-case.js";
import { ShiftOverlapError } from "../../domain/errors.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");

function setup() {
  const workShifts = new FakeWorkShiftRepository();
  const employees = new FakeEmployeeRepository();
  const auditLog = new FakeHrAuditLog();
  const useCase = new UpdateWorkShiftUseCase(workShifts, employees, auditLog);
  const employee = Employee.create({ fullName: "Andres Silva" });
  employees.seed(ORG, employee);
  return { workShifts, employees, auditLog, useCase, employee };
}

describe("UpdateWorkShiftUseCase", () => {
  it("edita o horário e marca source='manual'", async () => {
    const { useCase, employee, workShifts } = setup();
    const shift = WorkShift.create({
      employeeId: employee.id,
      workDate: "2026-08-10",
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
      source: "base_schedule",
    });
    workShifts.seed(ORG, shift);

    const updated = await useCase.execute({
      organizationId: ORG,
      actor: "manager",
      id: shift.id,
      startTime: "10:00",
    });

    expect(updated.startTime).toBe("10:00");
    expect(updated.source).toBe("manual");
  });

  it("não conta consigo próprio ao validar sobreposição", async () => {
    const { useCase, employee, workShifts } = setup();
    const shift = WorkShift.create({
      employeeId: employee.id,
      workDate: "2026-08-10",
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
    });
    workShifts.seed(ORG, shift);

    const updated = await useCase.execute({
      organizationId: ORG,
      actor: "manager",
      id: shift.id,
      startTime: "10:00",
      endTime: "18:00",
    });
    expect(updated.endTime).toBe("18:00");
  });

  it("rejeita quando a edição passa a sobrepor outro turno do mesmo dia", async () => {
    const { useCase, employee, workShifts } = setup();
    const shiftA = WorkShift.create({
      employeeId: employee.id,
      workDate: "2026-08-10",
      startTime: "09:00",
      endTime: "13:00",
      locationId: "loc-1",
    });
    const shiftB = WorkShift.create({
      employeeId: employee.id,
      workDate: "2026-08-10",
      startTime: "14:00",
      endTime: "18:00",
      locationId: "loc-1",
    });
    workShifts.seed(ORG, shiftA);
    workShifts.seed(ORG, shiftB);

    await expect(
      useCase.execute({ organizationId: ORG, actor: "manager", id: shiftB.id, startTime: "12:00" }),
    ).rejects.toThrow(ShiftOverlapError);
  });

  it("regista antes/depois na auditoria", async () => {
    const { useCase, employee, workShifts, auditLog } = setup();
    const shift = WorkShift.create({
      employeeId: employee.id,
      workDate: "2026-08-10",
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
    });
    workShifts.seed(ORG, shift);

    await useCase.execute({ organizationId: ORG, actor: "manager@angrybox.com", id: shift.id, notes: "Trocou turno" });

    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]!.actor).toBe("manager@angrybox.com");
    expect(auditLog.entries[0]!.before).toBeDefined();
    expect(auditLog.entries[0]!.after).toBeDefined();
  });
});
