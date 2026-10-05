import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { ShiftRotation } from "../../domain/entities/shift-rotation.js";
import { ListShiftRotationsUseCase } from "../../application/use-cases/list-shift-rotations.use-case.js";
import { FakeShiftRotationRepository } from "../fakes/fake-shift-rotation-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";

const ORG = mintOrganizationId("org-test");

describe("ListShiftRotationsUseCase", () => {
  it("devolve as rotações com os nomes dos participantes resolvidos", async () => {
    const rotations = new FakeShiftRotationRepository();
    const employees = new FakeEmployeeRepository();
    const useCase = new ListShiftRotationsUseCase(rotations, employees);
    const andres = Employee.create({ fullName: "Andres" });
    const gabriel = Employee.create({ fullName: "Gabriel" });
    employees.seed(ORG, andres);
    employees.seed(ORG, gabriel);
    rotations.seed(
      ORG,
      ShiftRotation.create({
        participantEmployeeIds: [andres.id, gabriel.id],
        patternA: { startTime: "11:30", endTime: "15:30" },
        patternB: { startTime: "17:00", endTime: "23:00" },
        locationId: "loc-1",
        anchorDate: "2026-08-10",
      }),
    );

    const result = await useCase.execute({ organizationId: ORG });

    expect(result).toHaveLength(1);
    expect(result[0]!.participantNames).toEqual(["Andres", "Gabriel"]);
  });
});
