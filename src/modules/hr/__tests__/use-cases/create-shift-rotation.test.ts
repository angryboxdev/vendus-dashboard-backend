import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { CreateShiftRotationUseCase } from "../../application/use-cases/create-shift-rotation.use-case.js";
import { InvalidShiftRotationError, EmployeeNotFoundError } from "../../domain/errors.js";
import { FakeShiftRotationRepository } from "../fakes/fake-shift-rotation-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");
const MONDAY = "2026-08-10";

function setup() {
  const rotations = new FakeShiftRotationRepository();
  const employees = new FakeEmployeeRepository();
  const auditLog = new FakeHrAuditLog();
  const useCase = new CreateShiftRotationUseCase(rotations, employees, auditLog);
  const andres = Employee.create({ fullName: "Andres" });
  const gabriel = Employee.create({ fullName: "Gabriel" });
  employees.seed(ORG, andres);
  employees.seed(ORG, gabriel);
  return { rotations, employees, auditLog, useCase, andres, gabriel };
}

describe("CreateShiftRotationUseCase", () => {
  it("cria a rotação com os nomes resolvidos", async () => {
    const { useCase, andres, gabriel } = setup();
    const rotation = await useCase.execute({
      organizationId: ORG,
      actor: "manager",
      participantEmployeeIds: [andres.id, gabriel.id],
      patternA: { startTime: "11:30", endTime: "15:30" },
      patternB: { startTime: "17:00", endTime: "23:00" },
      locationId: "loc-1",
      anchorDate: MONDAY,
    });

    expect(rotation.participantNames).toEqual(["Andres", "Gabriel"]);
    expect(rotation.active).toBe(true);
  });

  it("rejeita data de início que não seja segunda-feira", async () => {
    const { useCase, andres, gabriel } = setup();
    await expect(
      useCase.execute({
        organizationId: ORG,
        actor: "manager",
        participantEmployeeIds: [andres.id, gabriel.id],
        patternA: { startTime: "11:30", endTime: "15:30" },
        patternB: { startTime: "17:00", endTime: "23:00" },
        locationId: "loc-1",
        anchorDate: "2026-08-11",
      }),
    ).rejects.toThrow(InvalidShiftRotationError);
  });

  it("aceita colaboradores de cargos diferentes (a antiga \"Função\" já não restringe)", async () => {
    const { useCase, andres, employees } = setup();
    const manager = Employee.create({ fullName: "Chefe", positionId: "pos-gerente" });
    employees.seed(ORG, manager);

    await expect(
      useCase.execute({
        organizationId: ORG,
        actor: "manager",
        participantEmployeeIds: [andres.id, manager.id],
        patternA: { startTime: "11:30", endTime: "15:30" },
        patternB: { startTime: "17:00", endTime: "23:00" },
        locationId: "loc-1",
        anchorDate: MONDAY,
      }),
    ).resolves.toMatchObject({ participantNames: ["Andres", "Chefe"] });
  });

  it("cria com um padrão repartido e devolve o 2º período no DTO", async () => {
    const { useCase, andres, gabriel } = setup();
    const rotation = await useCase.execute({
      organizationId: ORG,
      actor: "manager",
      participantEmployeeIds: [andres.id, gabriel.id],
      patternA: { startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "23:00" },
      patternB: { startTime: "17:00", endTime: "23:00" },
      locationId: "loc-1",
      anchorDate: MONDAY,
    });

    expect(rotation.patternA.secondStartTime).toBe("19:00");
    expect(rotation.patternA.secondEndTime).toBe("23:00");
    expect(rotation.patternB.secondStartTime).toBeNull();
  });

  it("lança EmployeeNotFoundError para participante inexistente", async () => {
    const { useCase, andres } = setup();
    await expect(
      useCase.execute({
        organizationId: ORG,
        actor: "manager",
        participantEmployeeIds: [andres.id, "inexistente"],
        patternA: { startTime: "11:30", endTime: "15:30" },
        patternB: { startTime: "17:00", endTime: "23:00" },
        locationId: "loc-1",
        anchorDate: MONDAY,
      }),
    ).rejects.toThrow(EmployeeNotFoundError);
  });
});
