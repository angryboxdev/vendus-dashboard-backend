import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { CreateWorkShiftUseCase } from "../../application/use-cases/create-work-shift.use-case.js";
import { ShiftOverlapError, EmployeeNotFoundError } from "../../domain/errors.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");

function setup() {
  const workShifts = new FakeWorkShiftRepository();
  const employees = new FakeEmployeeRepository();
  const auditLog = new FakeHrAuditLog();
  const useCase = new CreateWorkShiftUseCase(workShifts, employees, auditLog);
  const employee = Employee.create({ fullName: "Andres Silva" });
  employees.seed(ORG, employee);
  return { workShifts, employees, auditLog, useCase, employee };
}

describe("CreateWorkShiftUseCase", () => {
  it("cria um turno em rascunho por omissão", async () => {
    const { useCase, employee } = setup();
    const [shift] = await useCase.execute({
      organizationId: ORG,
      actor: "manager@angrybox.com",
      employeeId: employee.id,
      workDate: "2026-08-10",
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
    });
    expect(shift!.status).toBe("draft");
    expect(shift!.employeeName).toBe("Andres Silva");
  });

  it("publish=true cria já publicado", async () => {
    const { useCase, employee } = setup();
    const [shift] = await useCase.execute({
      organizationId: ORG,
      actor: "manager@angrybox.com",
      employeeId: employee.id,
      workDate: "2026-08-10",
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
      publish: true,
    });
    expect(shift!.status).toBe("published");
  });

  it("rejeita quando sobrepõe um turno já existente do mesmo colaborador/dia", async () => {
    const { useCase, employee } = setup();
    await useCase.execute({
      organizationId: ORG,
      actor: "m",
      employeeId: employee.id,
      workDate: "2026-08-10",
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
    });

    await expect(
      useCase.execute({
        organizationId: ORG,
        actor: "m",
        employeeId: employee.id,
        workDate: "2026-08-10",
        startTime: "16:00",
        endTime: "20:00",
        locationId: "loc-1",
      }),
    ).rejects.toThrow(ShiftOverlapError);
  });

  it("repeatWeeks cria também para as semanas seguintes, cada uma validada", async () => {
    const { useCase, employee, workShifts } = setup();
    const result = await useCase.execute({
      organizationId: ORG,
      actor: "m",
      employeeId: employee.id,
      workDate: "2026-08-10",
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
      repeatWeeks: 2,
    });
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.workDate)).toEqual(["2026-08-10", "2026-08-17", "2026-08-24"]);
    const all = await workShifts.findInRange(ORG, { from: "2026-01-01", to: "2026-12-31" });
    expect(all).toHaveLength(3);
  });

  it("lança EmployeeNotFoundError para colaborador inexistente", async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({
        organizationId: ORG,
        actor: "m",
        employeeId: "inexistente",
        workDate: "2026-08-10",
        startTime: "09:00",
        endTime: "17:00",
        locationId: "loc-1",
      }),
    ).rejects.toThrow(EmployeeNotFoundError);
  });
});
