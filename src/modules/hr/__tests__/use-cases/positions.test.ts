import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { normalizePositionName, Position } from "../../domain/entities/position.js";
import { DuplicatePositionNameError, InvalidPositionError } from "../../domain/errors.js";
import {
  CreatePositionUseCase,
  ListPositionsUseCase,
  SetPositionActiveUseCase,
  UpdatePositionUseCase,
} from "../../application/use-cases/positions.use-cases.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakePositionRepository } from "../fakes/fake-position-repository.js";

const ORG = mintOrganizationId("org-test");
const OTHER_ORG = mintOrganizationId("org-other");
const NOW = () => new Date("2026-10-04T10:00:00.000Z");

function setup() {
  const positions = new FakePositionRepository();
  const employees = new FakeEmployeeRepository();
  const auditLog = new FakeHrAuditLog();
  const prep = Position.create("pos-prep", { name: "Preparador", description: null }, NOW());
  positions.seed(ORG, prep);
  return { positions, employees, auditLog, prep };
}

describe("Position", () => {
  it("normaliza nomes para detetar duplicados (maiúsculas e espaços)", () => {
    expect(normalizePositionName("  PREPARADOR ")).toBe(normalizePositionName("preparador"));
    expect(normalizePositionName("Gerente  de   Loja")).toBe("gerente de loja");
  });

  it("recusa nome vazio", () => {
    expect(() => Position.create("p", { name: "  ", description: null }, NOW())).toThrow(InvalidPositionError);
  });
});

describe("CreatePositionUseCase", () => {
  it("teste crítico 'Cargo duplicado': 'preparador' não cria um segundo cargo", async () => {
    const { positions, auditLog } = setup();
    const useCase = new CreatePositionUseCase(positions, auditLog, NOW, () => "pos-new");

    await expect(
      useCase.execute({ organizationId: ORG, actor: "rh@exemplo.pt", name: " preparador ", description: null }),
    ).rejects.toBeInstanceOf(DuplicatePositionNameError);
    expect(await positions.findAll(ORG)).toHaveLength(1);
  });

  it("cria um cargo novo, ativo, auditado no histórico do RH sem colaborador associado", async () => {
    const { positions, auditLog } = setup();
    const useCase = new CreatePositionUseCase(positions, auditLog, NOW, () => "pos-new");

    const dto = await useCase.execute({
      organizationId: ORG,
      actor: "rh@exemplo.pt",
      name: "Gerente de Loja",
      description: "Responsável pela loja",
    });

    expect(dto).toMatchObject({ id: "pos-new", name: "Gerente de Loja", active: true, employeeCount: 0 });
    expect(auditLog.entries[0]).toMatchObject({ entityType: "position", action: "position_created" });
    expect(auditLog.entries[0]?.employeeId).toBeUndefined();
  });

  it("o mesmo nome pode existir noutra organização", async () => {
    const { positions, auditLog } = setup();
    const useCase = new CreatePositionUseCase(positions, auditLog, NOW, () => "pos-other");
    await expect(
      useCase.execute({ organizationId: OTHER_ORG, actor: "a", name: "Preparador", description: null }),
    ).resolves.toMatchObject({ name: "Preparador" });
  });
});

describe("ListPositionsUseCase", () => {
  it("conta só colaboradores ativos com o cargo", async () => {
    const { positions, employees } = setup();
    employees.seed(ORG, Employee.create({ fullName: "Colaborador A", positionId: "pos-prep" }));
    employees.seed(ORG, Employee.create({ fullName: "Colaborador B", positionId: "pos-prep" }).deactivate());

    const [dto] = await new ListPositionsUseCase(positions, employees).execute(ORG);

    expect(dto?.employeeCount).toBe(1);
  });
});

describe("UpdatePositionUseCase", () => {
  it("renomear para um nome já existente é recusado", async () => {
    const { positions, employees, auditLog } = setup();
    positions.seed(ORG, Position.create("pos-mgr", { name: "Gerente", description: null }, NOW()));

    await expect(
      new UpdatePositionUseCase(positions, employees, auditLog, NOW).execute({ organizationId: ORG, actor: "a", id: "pos-mgr", name: "PREPARADOR" }),
    ).rejects.toBeInstanceOf(DuplicatePositionNameError);
  });
});

describe("SetPositionActiveUseCase", () => {
  it("inativa sem apagar e sem tirar o cargo a quem já o tem", async () => {
    const { positions, employees, auditLog } = setup();
    const holder = Employee.create({ fullName: "Colaborador A", positionId: "pos-prep" });
    employees.seed(ORG, holder);

    const dto = await new SetPositionActiveUseCase(positions, employees, auditLog, NOW).execute({
      organizationId: ORG,
      actor: "a",
      id: "pos-prep",
      active: false,
    });

    expect(dto).toMatchObject({ active: false, employeeCount: 1 });
    expect((await employees.findById(ORG, holder.id))?.positionId).toBe("pos-prep");
    expect(auditLog.entries[0]).toMatchObject({ action: "position_deactivated" });
  });
});
