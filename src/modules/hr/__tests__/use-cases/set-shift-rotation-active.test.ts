import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { ShiftRotation } from "../../domain/entities/shift-rotation.js";
import { SetShiftRotationActiveUseCase } from "../../application/use-cases/set-shift-rotation-active.use-case.js";
import { ShiftRotationNotFoundError } from "../../domain/errors.js";
import { FakeShiftRotationRepository } from "../fakes/fake-shift-rotation-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");

describe("SetShiftRotationActiveUseCase", () => {
  it("pausa uma rotação ativa e regista auditoria para os 2 participantes", async () => {
    const rotations = new FakeShiftRotationRepository();
    const employees = new FakeEmployeeRepository();
    const auditLog = new FakeHrAuditLog();
    const useCase = new SetShiftRotationActiveUseCase(rotations, employees, auditLog);
    const andres = Employee.create({ fullName: "Andres" });
    const gabriel = Employee.create({ fullName: "Gabriel" });
    employees.seed(ORG, andres);
    employees.seed(ORG, gabriel);
    const rotation = ShiftRotation.create({
      jobRole: "service",
      participantEmployeeIds: [andres.id, gabriel.id],
      patternA: { startTime: "11:30", endTime: "15:30" },
      patternB: { startTime: "17:00", endTime: "23:00" },
      locationId: "loc-1",
      anchorDate: "2026-08-10",
    });
    rotations.seed(ORG, rotation);

    const result = await useCase.execute({ organizationId: ORG, actor: "manager", rotationId: rotation.id, active: false });

    expect(result.active).toBe(false);
    expect(auditLog.entries).toHaveLength(2);
  });

  it("lança ShiftRotationNotFoundError para id inexistente", async () => {
    const rotations = new FakeShiftRotationRepository();
    const employees = new FakeEmployeeRepository();
    const auditLog = new FakeHrAuditLog();
    const useCase = new SetShiftRotationActiveUseCase(rotations, employees, auditLog);
    await expect(
      useCase.execute({ organizationId: ORG, actor: "manager", rotationId: "inexistente", active: false }),
    ).rejects.toThrow(ShiftRotationNotFoundError);
  });
});
