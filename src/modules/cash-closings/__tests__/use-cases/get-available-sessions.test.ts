import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetAvailableSessionsUseCase } from "../../application/use-cases/get-available-sessions.use-case.js";
import { FakeVendusRegisterSessionsGateway } from "../fakes/fake-vendus-register-sessions-gateway.js";
import { FakeCashClosingRepository } from "../fakes/fake-cash-closing-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { SubmitClosingUseCase } from "../../application/use-cases/submit-closing.use-case.js";

const organizationId = mintOrganizationId("org-a");

function makeUseCase() {
  const sessionsGateway = new FakeVendusRegisterSessionsGateway();
  const closingRepo = new FakeCashClosingRepository();
  const useCase = new GetAvailableSessionsUseCase(sessionsGateway, closingRepo);
  return { sessionsGateway, closingRepo, useCase };
}

describe("GetAvailableSessionsUseCase", () => {
  it("devolve lista vazia quando não há sessões no Vendus", async () => {
    const { useCase } = makeUseCase();
    const result = await useCase.execute({ organizationId, date: "2026-06-07" });
    expect(result).toHaveLength(0);
  });

  it("devolve sessões com alreadySubmitted=false quando não há fechos no DB", async () => {
    const { sessionsGateway, useCase } = makeUseCase();
    sessionsGateway.addSession("2026-06-07", {
      openedAt: "2026-06-07T11:16:15",
      closedAt: "2026-06-07T16:00:45",
      total: 162.37,
    });
    sessionsGateway.addSession("2026-06-07", {
      openedAt: "2026-06-07T16:01:55",
      closedAt: "2026-06-07T22:17:07",
      total: 679.13,
    });

    const result = await useCase.execute({ organizationId, date: "2026-06-07" });

    expect(result).toHaveLength(2);
    expect(result[0]?.alreadySubmitted).toBe(false);
    expect(result[1]?.alreadySubmitted).toBe(false);
    expect(result[0]?.total).toBe(162.37);
    expect(result[1]?.total).toBe(679.13);
  });

  it("marca sessão como alreadySubmitted quando já existe fecho para essa sessão", async () => {
    const { sessionsGateway, closingRepo, useCase } = makeUseCase();

    sessionsGateway.addSession("2026-06-07", {
      openedAt: "2026-06-07T11:16:15",
      closedAt: "2026-06-07T16:00:45",
      total: 162.37,
    });
    sessionsGateway.addSession("2026-06-07", {
      openedAt: "2026-06-07T16:01:55",
      closedAt: null, // ainda aberta
      total: 200,
    });

    // Submeter fecho para a primeira sessão
    const employeeRepo = new FakeEmployeeRepository();
    employeeRepo.addEmployee(organizationId, { id: "emp-1", fullName: "Ana Silva" });
    const submitUseCase = new SubmitClosingUseCase(
      closingRepo,
      employeeRepo,
      sessionsGateway,
    );
    await submitUseCase.execute({
      organizationId,
      locationId: "loc-1",
      employeeId: "emp-1",
      closingDate: "2026-06-07",
      tpa: 0, uber: 0, glovo: 0, bolt: 0, eatz: 0,
      cashSales: 162.37, cashIn: 100, cashOut: 0,
      cashDrawerOpen: 100, cashDrawerTotal: 200,
      sessionOpenedAt: "2026-06-07T11:16:15",
    });

    const result = await useCase.execute({ organizationId, date: "2026-06-07" });

    expect(result[0]?.alreadySubmitted).toBe(true);
    expect(result[1]?.alreadySubmitted).toBe(false);
  });

  it("sessão em aberto (closedAt=null) aparece disponível", async () => {
    const { sessionsGateway, useCase } = makeUseCase();
    sessionsGateway.addSession("2026-06-13", {
      openedAt: "2026-06-13T10:50:16",
      closedAt: null,
      total: 379.39,
    });

    const result = await useCase.execute({ organizationId, date: "2026-06-13" });

    expect(result).toHaveLength(1);
    expect(result[0]?.closedAt).toBeNull();
    expect(result[0]?.alreadySubmitted).toBe(false);
  });

  it("não marca alreadySubmitted usando um fecho de outra organização", async () => {
    const { sessionsGateway, closingRepo, useCase } = makeUseCase();
    sessionsGateway.addSession("2026-06-07", {
      openedAt: "2026-06-07T11:16:15",
      closedAt: "2026-06-07T16:00:45",
      total: 162.37,
    });

    const otherOrganizationId = mintOrganizationId("org-b");
    const employeeRepo = new FakeEmployeeRepository();
    employeeRepo.addEmployee(otherOrganizationId, { id: "emp-1", fullName: "Ana Silva" });
    const submitUseCase = new SubmitClosingUseCase(closingRepo, employeeRepo, sessionsGateway);
    await submitUseCase.execute({
      organizationId: otherOrganizationId,
      locationId: "loc-1",
      employeeId: "emp-1",
      closingDate: "2026-06-07",
      tpa: 0, uber: 0, glovo: 0, bolt: 0, eatz: 0,
      cashSales: 162.37, cashIn: 100, cashOut: 0,
      cashDrawerOpen: 100, cashDrawerTotal: 200,
      sessionOpenedAt: "2026-06-07T11:16:15",
    });

    const result = await useCase.execute({ organizationId, date: "2026-06-07" });

    expect(result[0]?.alreadySubmitted).toBe(false);
  });
});
