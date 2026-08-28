import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { SubmitClosingUseCase } from "../../application/use-cases/submit-closing.use-case.js";
import { ListClosingsUseCase } from "../../application/use-cases/list-closings.use-case.js";
import { FakeCashClosingRepository } from "../fakes/fake-cash-closing-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeVendusRegisterSessionsGateway } from "../fakes/fake-vendus-register-sessions-gateway.js";

const organizationId = mintOrganizationId("org-a");

function makeUseCases() {
  const closingRepo = new FakeCashClosingRepository();
  const employeeRepo = new FakeEmployeeRepository();
  const sessionsGateway = new FakeVendusRegisterSessionsGateway();
  const submitUseCase = new SubmitClosingUseCase(closingRepo, employeeRepo, sessionsGateway);
  const listUseCase = new ListClosingsUseCase(closingRepo);
  return { closingRepo, employeeRepo, submitUseCase, listUseCase };
}

async function seedClosings(
  submitUseCase: SubmitClosingUseCase,
  employeeRepo: FakeEmployeeRepository,
) {
  employeeRepo.addEmployee(organizationId, { id: "emp-1", fullName: "Ana Silva" });
  employeeRepo.addEmployee(organizationId, { id: "emp-2", fullName: "Bruno Costa" });

  await submitUseCase.execute({
    organizationId, locationId: "loc-1",
    employeeId: "emp-1", closingDate: "2026-06-09",
    tpa: 100, uber: 0, glovo: 0, bolt: 0, eatz: 0, cashSales: 50,
    cashIn: 0, cashOut: 0, cashDrawerOpen: 100, cashDrawerTotal: 150,
  });
  await submitUseCase.execute({
    organizationId, locationId: "loc-1",
    employeeId: "emp-2", closingDate: "2026-06-10",
    tpa: 200, uber: 0, glovo: 0, bolt: 0, eatz: 0, cashSales: 100,
    cashIn: 0, cashOut: 0, cashDrawerOpen: 100, cashDrawerTotal: 100,
  });
  await submitUseCase.execute({
    organizationId, locationId: "loc-1",
    employeeId: "emp-1", closingDate: "2026-06-10",
    tpa: 150, uber: 0, glovo: 0, bolt: 0, eatz: 0, cashSales: 80,
    cashIn: 0, cashOut: 0, cashDrawerOpen: 100, cashDrawerTotal: 200,
  });
}

describe("ListClosingsUseCase", () => {
  it("devolve todos os fechos sem filtros", async () => {
    const { employeeRepo, submitUseCase, listUseCase } = makeUseCases();
    await seedClosings(submitUseCase, employeeRepo);

    const result = await listUseCase.execute({ organizationId });
    expect(result.total).toBe(3);
    expect(result.closings).toHaveLength(3);
  });

  it("filtra por intervalo de datas (from/to)", async () => {
    const { employeeRepo, submitUseCase, listUseCase } = makeUseCases();
    await seedClosings(submitUseCase, employeeRepo);

    const result = await listUseCase.execute({ organizationId, from: "2026-06-10", to: "2026-06-10" });
    expect(result.total).toBe(2);
    expect(result.closings.every((c) => c.closingDate === "2026-06-10")).toBe(true);
  });

  it("suporta filtro por date como atalho para from=to=date", async () => {
    const { employeeRepo, submitUseCase, listUseCase } = makeUseCases();
    await seedClosings(submitUseCase, employeeRepo);

    const result = await listUseCase.execute({ organizationId, date: "2026-06-09" });
    expect(result.total).toBe(1);
    expect(result.closings[0]?.closingDate).toBe("2026-06-09");
  });

  it("filtra por employeeId", async () => {
    const { employeeRepo, submitUseCase, listUseCase } = makeUseCases();
    await seedClosings(submitUseCase, employeeRepo);

    const result = await listUseCase.execute({ organizationId, employeeId: "emp-1" });
    expect(result.total).toBe(2);
    expect(result.closings.every((c) => c.employeeId === "emp-1")).toBe(true);
  });

  it("aplica limit e offset", async () => {
    const { employeeRepo, submitUseCase, listUseCase } = makeUseCases();
    await seedClosings(submitUseCase, employeeRepo);

    const page1 = await listUseCase.execute({ organizationId, limit: 2, offset: 0 });
    const page2 = await listUseCase.execute({ organizationId, limit: 2, offset: 2 });

    expect(page1.closings).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page2.closings).toHaveLength(1);
  });

  it("não devolve fechos de outra organização", async () => {
    const { employeeRepo, submitUseCase, listUseCase } = makeUseCases();
    await seedClosings(submitUseCase, employeeRepo);

    const otherOrganizationId = mintOrganizationId("org-b");
    const result = await listUseCase.execute({ organizationId: otherOrganizationId });

    expect(result.total).toBe(0);
    expect(result.closings).toHaveLength(0);
  });
});
