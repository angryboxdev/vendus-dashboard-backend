import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { EmploymentUseCases } from "../../application/use-cases/employment.use-cases.js";
import { createsCycle, type ManagerLink } from "../../domain/entities/employment.js";
import { FakePeopleRepo, viewer } from "../fakes/fake-people.js";

const ORG = mintOrganizationId("org-test");
const ADMIN = viewer({ isAdmin: true });

// Dados fictícios (RGPD).
function setup() {
  const repo = new FakePeopleRepo();
  const events: string[] = [];
  const employment = new EmploymentUseCases(repo, { record: async (_o, e) => void events.push(e.action) }, { today: async () => "2026-10-22" });
  for (const [id, firstName] of [["ceo", "Carla"], ["a", "Ana"], ["b", "Bia"], ["c", "Cid"]] as const) repo.seed({ id, firstName, lastName: "Teste" });
  return { repo, employment, events };
}

const link = (employeeId: string, managerEmployeeId: string): ManagerLink => ({ id: `${employeeId}-${managerEmployeeId}`, employeeId, managerEmployeeId, kind: "direct", level: 1, validFrom: "2026-01-01", validTo: null });

describe("Organograma (chefias diretas)", () => {
  test("ciclos: o novo responsável não pode estar abaixo do colaborador", () => {
    const active = [link("a", "ceo"), link("b", "a"), link("c", "b")];
    expect(createsCycle(active, "a", "c")).toBe(true);
    expect(createsCycle(active, "a", "b")).toBe(true);
    expect(createsCycle(active, "c", "ceo")).toBe(false);
  });

  test("mudar a chefia termina a atual na véspera, cria a nova e audita; sem chefia também", async () => {
    const { repo, employment, events } = setup();
    await employment.addManager(ORG, ADMIN, { employeeId: "a", managerEmployeeId: "ceo", kind: "direct", level: 1, validFrom: "2026-01-01", validTo: null });
    await employment.setDirectManager(ORG, ADMIN, "a", "b", "2026-10-22");
    const own = await repo.listManagers(ORG, "a");
    expect(own.map((m) => [m.managerEmployeeId, m.validFrom, m.validTo])).toEqual([
      ["ceo", "2026-01-01", "2026-10-21"],
      ["b", "2026-10-22", null],
    ]);
    expect(await employment.orgChart(ORG, ADMIN, "2026-10-22")).toEqual([expect.objectContaining({ employeeId: "a", managerEmployeeId: "b" })]);
    expect(await employment.orgChart(ORG, ADMIN, "2026-10-01")).toEqual([expect.objectContaining({ employeeId: "a", managerEmployeeId: "ceo" })]);
    await employment.setDirectManager(ORG, ADMIN, "a", null, "2026-10-30");
    expect(await employment.orgChart(ORG, ADMIN, "2026-10-30")).toEqual([]);
    expect(events).toEqual(["people.manager.add", "people.manager.end", "people.manager.add", "people.manager.end"]);
  });

  test("recusa ciclos e a própria pessoa; o organograma só mostra quem se pode ver", async () => {
    const { employment } = setup();
    await employment.setDirectManager(ORG, ADMIN, "b", "a", "2026-10-22");
    await expect(employment.setDirectManager(ORG, ADMIN, "a", "b", "2026-10-22")).rejects.toThrow("ciclo");
    await expect(employment.setDirectManager(ORG, ADMIN, "a", "a", "2026-10-22")).rejects.toThrow("si próprio");
    await employment.setDirectManager(ORG, ADMIN, "c", "ceo", "2026-10-22");
    const scoped = viewer({ scope: ["a", "b"] });
    expect((await employment.orgChart(ORG, scoped, "2026-10-22")).map((l) => l.employeeId)).toEqual(["b"]);
  });

  test("co-chefia: dois responsáveis diretos em simultâneo; trocar a lista termina só quem sai", async () => {
    const { repo, employment } = setup();
    // Os dois sócios por cima do gerente.
    await employment.setDirectManagers(ORG, ADMIN, "a", ["ceo", "b"], "2026-10-22");
    expect((await employment.orgChart(ORG, ADMIN, "2026-10-22")).map((l) => l.managerEmployeeId).sort()).toEqual(["b", "ceo"]);
    await expect(employment.setDirectManagers(ORG, ADMIN, "a", ["ceo", "b", "c", "a"], "2026-10-23")).rejects.toThrow("No máximo 3");
    await employment.setDirectManagers(ORG, ADMIN, "a", ["ceo"], "2026-11-01");
    const own = await repo.listManagers(ORG, "a");
    expect(own.map((m) => [m.managerEmployeeId, m.validTo])).toEqual([
      ["ceo", null],
      ["b", "2026-10-31"],
    ]);
    // O mesmo responsável não se repete; ciclos continuam recusados.
    await expect(employment.addManager(ORG, ADMIN, { employeeId: "a", managerEmployeeId: "ceo", kind: "direct", level: 1, validFrom: "2026-12-01", validTo: null })).rejects.toThrow("já está atribuído");
    await expect(employment.setDirectManagers(ORG, ADMIN, "ceo", ["a"], "2026-11-01")).rejects.toThrow("ciclo");
  });

  test("corrigir no mesmo dia vale logo: a chefia que ainda não tinha começado sai (auditada), sem esperar por amanhã", async () => {
    const { repo, employment, events } = setup();
    await employment.setDirectManagers(ORG, ADMIN, "c", ["a"], "2026-10-22");
    await employment.setDirectManagers(ORG, ADMIN, "c", ["b"], "2026-10-22");
    await employment.setDirectManagers(ORG, ADMIN, "c", ["a"], "2026-10-22");
    expect((await employment.orgChart(ORG, ADMIN, "2026-10-22")).filter((l) => l.employeeId === "c").map((l) => l.managerEmployeeId)).toEqual(["a"]);
    expect((await repo.listManagers(ORG, "c")).map((m) => [m.managerEmployeeId, m.validFrom, m.validTo])).toEqual([["a", "2026-10-22", null]]);
    expect(events.filter((e) => e === "people.manager.remove")).toHaveLength(2);
  });
});
