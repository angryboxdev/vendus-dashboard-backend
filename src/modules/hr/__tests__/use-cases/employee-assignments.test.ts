import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Location } from "../../../locations/domain/entities/location.js";
import { Employee } from "../../domain/entities/employee.js";
import { Position } from "../../domain/entities/position.js";
import { InactivePositionError, InvalidEmployeeLocationError, PositionNotFoundError } from "../../domain/errors.js";
import { CreateEmployeeUseCase } from "../../application/use-cases/create-employee.use-case.js";
import { UpdateEmployeeUseCase } from "../../application/use-cases/update-employee.use-case.js";
import { ListEmployeesUseCase } from "../../application/use-cases/list-employees.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakePositionRepository } from "../fakes/fake-position-repository.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import { FakeDocumentRepository } from "../../../documents/__tests__/fakes/fake-document-repository.js";
import { FakeHrFileStorage } from "../fakes/fake-hr-file-storage.js";
import { FakeDocumentCategoryRepository } from "../../../documents/__tests__/fakes/fake-document-category-repository.js";

const ORG = mintOrganizationId("org-test");
const NOW = new Date("2026-10-04T10:00:00.000Z");

function location(id: string, name: string, isActive = true): Location {
  return Location.reconstitute({ id, name, code: null, timezone: "Europe/Lisbon", isActive });
}

function setup() {
  const employees = new FakeEmployeeRepository();
  const auditLog = new FakeHrAuditLog();
  const positions = new FakePositionRepository();
  const locations = new FakeLocationRepository();
  positions.seed(ORG, Position.create("pos-mgr", { name: "Gerente de Loja", description: null, operationalCategory: "manager" }, NOW));
  positions.seed(ORG, Position.create("pos-old", { name: "Copeiro", description: null, operationalCategory: "service" }, NOW).setActive(false, NOW));
  locations.seed(ORG, [location("loc-mbs", "Mercado"), location("loc-gaia", "Gaia"), location("loc-closed", "Antiga loja", false)]);
  return {
    employees,
    auditLog,
    create: new CreateEmployeeUseCase(employees, auditLog, positions, locations),
    update: new UpdateEmployeeUseCase(employees, auditLog, positions, locations),
  };
}

describe("Cargo e locais do colaborador", () => {
  it("o jobRole passa a ser a categoria operacional do cargo (D4)", async () => {
    const { create } = setup();

    const dto = await create.execute({ organizationId: ORG, actor: "rh", fullName: "Colaborador A", positionId: "pos-mgr" });

    expect(dto).toMatchObject({ positionId: "pos-mgr", jobRole: "manager" });
  });

  it("cargo inexistente ou inativo não pode ser atribuído", async () => {
    const { create } = setup();

    await expect(create.execute({ organizationId: ORG, actor: "rh", fullName: "A", positionId: "nao-existe" })).rejects.toBeInstanceOf(
      PositionNotFoundError,
    );
    await expect(create.execute({ organizationId: ORG, actor: "rh", fullName: "A", positionId: "pos-old" })).rejects.toBeInstanceOf(
      InactivePositionError,
    );
  });

  it("quem já tem um cargo entretanto inativado continua a poder ser editado", async () => {
    const { employees, update } = setup();
    const existing = Employee.create({ fullName: "Colaborador A", positionId: "pos-old", jobRole: "service" });
    employees.seed(ORG, existing);

    const dto = await update.execute({ organizationId: ORG, actor: "rh", id: existing.id, data: { phone: "910000000", positionId: "pos-old" } });

    expect(dto.positionId).toBe("pos-old");
  });

  it("local principal e autorizados guardam-se por id; o principal nunca se repete nos autorizados", async () => {
    const { create } = setup();

    const dto = await create.execute({
      organizationId: ORG,
      actor: "rh",
      fullName: "Colaborador A",
      primaryLocationId: "loc-mbs",
      authorizedLocationIds: ["loc-gaia", "loc-mbs", "loc-gaia"],
    });

    expect(dto.primaryLocationId).toBe("loc-mbs");
    expect(dto.authorizedLocationIds).toEqual(["loc-gaia"]);
  });

  it("local inexistente ou inativo é recusado numa atribuição nova", async () => {
    const { create } = setup();

    await expect(create.execute({ organizationId: ORG, actor: "rh", fullName: "A", primaryLocationId: "loc-x" })).rejects.toBeInstanceOf(
      InvalidEmployeeLocationError,
    );
    await expect(
      create.execute({ organizationId: ORG, actor: "rh", fullName: "A", primaryLocationId: "loc-closed" }),
    ).rejects.toBeInstanceOf(InvalidEmployeeLocationError);
  });

  it("teste crítico 'Local utilizado': o colaborador de um local inativado mantém a relação ao ser editado", async () => {
    const { employees, update } = setup();
    const existing = Employee.create({ fullName: "Colaborador A", primaryLocationId: "loc-closed" });
    employees.seed(ORG, existing);

    const dto = await update.execute({
      organizationId: ORG,
      actor: "rh",
      id: existing.id,
      data: { phone: "910000000", primaryLocationId: "loc-closed" },
    });

    expect(dto.primaryLocationId).toBe("loc-closed");
  });

  it("mudança de cargo/local fica no histórico do colaborador", async () => {
    const { employees, auditLog, update } = setup();
    const existing = Employee.create({ fullName: "Colaborador A" });
    employees.seed(ORG, existing);

    await update.execute({ organizationId: ORG, actor: "rh", id: existing.id, data: { positionId: "pos-mgr", primaryLocationId: "loc-mbs" } });

    expect(auditLog.entries[0]?.description).toBe("Colaborador Colaborador A atualizado — cargo alterado — locais alterados");
    expect((auditLog.entries[0]?.after as { positionId: string }).positionId).toBe("pos-mgr");
  });
});

describe("ListEmployeesUseCase — filtros de cargo e local", () => {
  it("filtra por cargo e por local (principal ou autorizado)", async () => {
    const { employees } = setup();
    employees.seed(ORG, Employee.create({ fullName: "Ana", positionId: "pos-mgr", primaryLocationId: "loc-mbs" }));
    employees.seed(ORG, Employee.create({ fullName: "Bruno", primaryLocationId: "loc-gaia", authorizedLocationIds: ["loc-mbs"] }));
    employees.seed(ORG, Employee.create({ fullName: "Carla", primaryLocationId: "loc-gaia" }));
    const list = new ListEmployeesUseCase(employees, new FakeDocumentRepository(), new FakeHrFileStorage(), new FakeDocumentCategoryRepository());

    const byPosition = await list.execute({ organizationId: ORG, viewerRole: "manager", positionId: "pos-mgr", page: 1, pageSize: 10 });
    const byLocation = await list.execute({ organizationId: ORG, viewerRole: "manager", locationId: "loc-mbs", page: 1, pageSize: 10 });

    expect(byPosition.items.map((r) => r.fullName)).toEqual(["Ana"]);
    expect(byLocation.items.map((r) => r.fullName)).toEqual(["Ana", "Bruno"]);
  });
});
