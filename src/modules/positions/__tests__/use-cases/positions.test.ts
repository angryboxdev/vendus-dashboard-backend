import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { normalizePositionName, Position } from "../../domain/entities/position.js";
import { DuplicatePositionNameError, InvalidPositionError } from "../../domain/errors.js";
import { CreatePositionUseCase, ListPositionsUseCase, SetPositionActiveUseCase, UpdatePositionUseCase } from "../../application/use-cases/positions.use-cases.js";
import { FakePositionAudit, FakePositionHolders } from "../fakes/fake-position-deps.js";
import { FakePositionRepository } from "../fakes/fake-position-repository.js";

const ORG = mintOrganizationId("org-test");
const OTHER_ORG = mintOrganizationId("org-other");
const NOW = () => new Date("2026-10-04T10:00:00.000Z");

function setup() {
  const positions = new FakePositionRepository();
  const holders = new FakePositionHolders();
  const audit = new FakePositionAudit();
  const prep = Position.create("pos-prep", { name: "Preparador", description: null }, NOW());
  positions.seed(ORG, prep);
  return { positions, holders, audit, prep };
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
    const { positions, audit } = setup();
    const useCase = new CreatePositionUseCase(positions, audit, NOW, () => "pos-new");
    await expect(useCase.execute({ organizationId: ORG, actor: "rh@exemplo.pt", name: " preparador ", description: null })).rejects.toBeInstanceOf(DuplicatePositionNameError);
    expect(await positions.findAll(ORG)).toHaveLength(1);
  });

  it("cria um cargo novo, ativo e auditado", async () => {
    const { positions, audit } = setup();
    const dto = await new CreatePositionUseCase(positions, audit, NOW, () => "pos-new").execute({
      organizationId: ORG,
      actor: "rh@exemplo.pt",
      name: "Gerente de Loja",
      description: "Responsável pela loja",
    });
    expect(dto).toMatchObject({ id: "pos-new", name: "Gerente de Loja", active: true, employeeCount: 0 });
    expect(audit.entries[0]).toMatchObject({ positionId: "pos-new", action: "position_created" });
  });

  it("o mesmo nome pode existir noutra organização", async () => {
    const { positions, audit } = setup();
    await expect(new CreatePositionUseCase(positions, audit, NOW, () => "pos-other").execute({ organizationId: OTHER_ORG, actor: "a", name: "Preparador", description: null })).resolves.toMatchObject({ name: "Preparador" });
  });
});

describe("ListPositionsUseCase", () => {
  it("conta só colaboradores ativos com o cargo", async () => {
    const { positions, holders } = setup();
    holders.seed(ORG, "pos-prep", true);
    holders.seed(ORG, "pos-prep", false);
    const [dto] = await new ListPositionsUseCase(positions, holders).execute(ORG);
    expect(dto?.employeeCount).toBe(1);
  });
});

describe("UpdatePositionUseCase", () => {
  it("renomear para um nome já existente é recusado", async () => {
    const { positions, holders, audit } = setup();
    positions.seed(ORG, Position.create("pos-mgr", { name: "Gerente", description: null }, NOW()));
    await expect(new UpdatePositionUseCase(positions, holders, audit, NOW).execute({ organizationId: ORG, actor: "a", id: "pos-mgr", name: "PREPARADOR" })).rejects.toBeInstanceOf(DuplicatePositionNameError);
  });
});

describe("SetPositionActiveUseCase", () => {
  it("inativa sem apagar e mantém a contagem de quem já o tem", async () => {
    const { positions, holders, audit } = setup();
    holders.seed(ORG, "pos-prep", true);
    const dto = await new SetPositionActiveUseCase(positions, holders, audit, NOW).execute({ organizationId: ORG, actor: "a", id: "pos-prep", active: false });
    expect(dto).toMatchObject({ active: false, employeeCount: 1 });
    expect(audit.entries[0]).toMatchObject({ action: "position_deactivated" });
  });
});
