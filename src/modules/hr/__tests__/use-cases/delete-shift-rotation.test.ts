import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ShiftRotation } from "../../domain/entities/shift-rotation.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { DeleteShiftRotationUseCase } from "../../application/use-cases/delete-shift-rotation.use-case.js";
import { ShiftRotationNotFoundError } from "../../domain/errors.js";
import { FakeShiftRotationRepository } from "../fakes/fake-shift-rotation-repository.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");

describe("DeleteShiftRotationUseCase", () => {
  it("apaga a rotação, regista no histórico dos 2 participantes e não toca nos turnos já criados", async () => {
    const rotations = new FakeShiftRotationRepository();
    const workShifts = new FakeWorkShiftRepository();
    const auditLog = new FakeHrAuditLog();
    const rotation = ShiftRotation.create({
      participantEmployeeIds: ["e1", "e2"],
      patternA: { startTime: "11:30", endTime: "15:30" },
      patternB: { startTime: "17:00", endTime: "23:00" },
      locationId: "loc-1",
      anchorDate: "2026-10-19",
    });
    rotations.seed(ORG, rotation);
    const shift = WorkShift.create({ employeeId: "e1", workDate: "2026-10-19", startTime: "11:30", endTime: "15:30", locationId: "loc-1", source: "rotation", rotationId: rotation.id });
    workShifts.seed(ORG, shift);

    await new DeleteShiftRotationUseCase(rotations, auditLog).execute({ organizationId: ORG, actor: "gestor", rotationId: rotation.id });

    expect(await rotations.findById(ORG, rotation.id)).toBeNull();
    expect(await workShifts.findById(ORG, shift.id)).not.toBeNull();
    expect(auditLog.entries.map((e) => [e.employeeId, e.action])).toEqual([
      ["e1", "deleted"],
      ["e2", "deleted"],
    ]);
  });

  it("lança ShiftRotationNotFoundError para id inexistente", async () => {
    const useCase = new DeleteShiftRotationUseCase(new FakeShiftRotationRepository(), new FakeHrAuditLog());
    await expect(useCase.execute({ organizationId: ORG, actor: "gestor", rotationId: "x" })).rejects.toThrow(ShiftRotationNotFoundError);
  });
});
