import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { ShiftRotation } from "../../domain/entities/shift-rotation.js";
import { PreviewShiftRotationUseCase } from "../../application/use-cases/preview-shift-rotation.use-case.js";
import { ShiftRotationNotFoundError } from "../../domain/errors.js";
import { FakeShiftRotationRepository } from "../fakes/fake-shift-rotation-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";

const ORG = mintOrganizationId("org-test");
const MONDAY = "2026-08-10";

describe("PreviewShiftRotationUseCase", () => {
  it("pré-visualiza 2 semanas por omissão, alternando os participantes", async () => {
    const rotations = new FakeShiftRotationRepository();
    const employees = new FakeEmployeeRepository();
    const useCase = new PreviewShiftRotationUseCase(rotations, employees);
    const andres = Employee.create({ fullName: "Andres" });
    const gabriel = Employee.create({ fullName: "Gabriel" });
    employees.seed(ORG, andres);
    employees.seed(ORG, gabriel);
    const rotation = ShiftRotation.create({
      participantEmployeeIds: [andres.id, gabriel.id],
      patternA: { startTime: "11:30", endTime: "15:30" },
      patternB: { startTime: "17:00", endTime: "23:00" },
      locationId: "loc-1",
      anchorDate: MONDAY,
    });
    rotations.seed(ORG, rotation);

    const preview = await useCase.execute({ organizationId: ORG, rotationId: rotation.id });

    expect(preview).toHaveLength(2);
    expect(preview[0]).toEqual({
      weekStartDate: MONDAY,
      patternAEmployeeId: andres.id,
      patternAEmployeeName: "Andres",
      patternBEmployeeId: gabriel.id,
      patternBEmployeeName: "Gabriel",
      patternA: { startTime: "11:30", endTime: "15:30", secondStartTime: null, secondEndTime: null },
      patternB: { startTime: "17:00", endTime: "23:00", secondStartTime: null, secondEndTime: null },
    });
    expect(preview[1]!.patternAEmployeeId).toBe(gabriel.id);
  });

  it("lança ShiftRotationNotFoundError para id inexistente", async () => {
    const rotations = new FakeShiftRotationRepository();
    const employees = new FakeEmployeeRepository();
    const useCase = new PreviewShiftRotationUseCase(rotations, employees);
    await expect(useCase.execute({ organizationId: ORG, rotationId: "inexistente" })).rejects.toThrow(
      ShiftRotationNotFoundError,
    );
  });
});
