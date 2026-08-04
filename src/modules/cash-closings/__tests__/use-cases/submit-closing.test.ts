import { SubmitClosingUseCase } from "../../application/use-cases/submit-closing.use-case.js";
import { FakeCashClosingRepository } from "../fakes/fake-cash-closing-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeVendusRegisterSessionsGateway } from "../fakes/fake-vendus-register-sessions-gateway.js";
import { FakeAirMenuDeliveryGateway } from "../fakes/fake-air-menu-delivery-gateway.js";
import { DuplicateClosingError, EmployeeNotFoundError } from "../../domain/errors.js";

function makeUseCase() {
  const closingRepo = new FakeCashClosingRepository();
  const employeeRepo = new FakeEmployeeRepository();
  const sessionsGateway = new FakeVendusRegisterSessionsGateway();
  const useCase = new SubmitClosingUseCase(closingRepo, employeeRepo, sessionsGateway);
  return { closingRepo, employeeRepo, sessionsGateway, useCase };
}

function makeUseCaseWithAirMenu() {
  const closingRepo = new FakeCashClosingRepository();
  const employeeRepo = new FakeEmployeeRepository();
  const sessionsGateway = new FakeVendusRegisterSessionsGateway();
  const airMenuGateway = new FakeAirMenuDeliveryGateway();
  const useCase = new SubmitClosingUseCase(closingRepo, employeeRepo, sessionsGateway, airMenuGateway);
  return { closingRepo, employeeRepo, airMenuGateway, useCase };
}

const baseCommand = {
  employeeId: "emp-1",
  closingDate: "2026-06-10",
  tpa: 200,
  uber: 50,
  glovo: 30,
  bolt: 20,
  eatz: 10,
  cashSales: 100,
  cashIn: 50,
  cashOut: 20,
  cashDrawerOpen: 100,
  cashDrawerTotal: 250,
};

describe("SubmitClosingUseCase", () => {
  it("persiste o fecho e devolve DTO correcto", async () => {
    const { closingRepo, employeeRepo, useCase } = makeUseCase();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });

    const result = await useCase.execute(baseCommand);

    expect(result.status).toBe("pending");
    expect(result.employeeName).toBe("Ana Silva");
    expect(result.totalCalculated).toBe(410);
    expect(result.vendusCalculated).toBe(310); // 200 + 10 + 100
    expect(result.airMenuCalculated).toBe(100); // 50 + 30 + 20
    expect(result.airMenuTotal).toBeNull(); // sem gateway AirMenu
    expect(result.sangriaAmount).toBe(150);
    expect(result.vendusTotal).toBeNull(); // sem sessão, vendusTotal fica null

    expect(closingRepo.findAll()).toHaveLength(1);
  });

  it("lança EmployeeNotFoundError para funcionário inexistente", async () => {
    const { useCase } = makeUseCase();
    await expect(useCase.execute(baseCommand)).rejects.toThrow(EmployeeNotFoundError);
  });

  it("lança DuplicateClosingError para fecho duplicado no mesmo dia", async () => {
    const { employeeRepo, useCase } = makeUseCase();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });

    await useCase.execute(baseCommand);
    await expect(useCase.execute(baseCommand)).rejects.toThrow(DuplicateClosingError);
  });

  it("vendusTotal fica null quando não há sessionOpenedAt", async () => {
    const { employeeRepo, useCase } = makeUseCase();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });

    const result = await useCase.execute(baseCommand); // sem sessionOpenedAt
    expect(result.vendusTotal).toBeNull();
    expect(result.status).toBe("pending");
  });

  it("passa drawerDenominations ao DTO quando fornecido", async () => {
    const { employeeRepo, useCase } = makeUseCase();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });
    const denoms = {
      notes50: 1, notes20: 2, notes10: 0, notes5: 1,
      coins200: 3, coins100: 2, coins50: 1, coins20: 0, coins10: 0, coins1: 5,
    };

    const result = await useCase.execute({ ...baseCommand, drawerDenominations: denoms });

    expect(result.drawerDenominations).toEqual(denoms);
  });

  it("drawerDenominations fica null no DTO quando não fornecido", async () => {
    const { employeeRepo, useCase } = makeUseCase();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });

    const result = await useCase.execute(baseCommand);

    expect(result.drawerDenominations).toBeNull();
  });

  it("campos AirMenu ficam null quando gateway não configurado", async () => {
    const { employeeRepo, useCase } = makeUseCase();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });

    const result = await useCase.execute(baseCommand);

    expect(result.airMenuUber).toBeNull();
    expect(result.airMenuGlovo).toBeNull();
    expect(result.airMenuBolt).toBeNull();
  });

  it("permite que o mesmo funcionário submeta em datas diferentes", async () => {
    const { closingRepo, employeeRepo, useCase } = makeUseCase();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });

    await useCase.execute({ ...baseCommand, closingDate: "2026-06-10" });
    await useCase.execute({ ...baseCommand, closingDate: "2026-06-11" });

    expect(closingRepo.findAll()).toHaveLength(2);
  });
});

describe("SubmitClosingUseCase — modo sessions", () => {
  const SESSION_1 = "2026-06-07T11:16:15";
  const SESSION_2 = "2026-06-07T16:01:55";

  function makeUseCaseWithSessions() {
    const closingRepo = new FakeCashClosingRepository();
    const employeeRepo = new FakeEmployeeRepository();
    const sessionsGateway = new FakeVendusRegisterSessionsGateway();
    sessionsGateway.addSession("2026-06-07", { openedAt: SESSION_1, closedAt: "2026-06-07T16:00:45", total: 162.37 });
    sessionsGateway.addSession("2026-06-07", { openedAt: SESSION_2, closedAt: "2026-06-07T22:17:07", total: 679.13 });
    const useCase = new SubmitClosingUseCase(closingRepo, employeeRepo, sessionsGateway);
    return { closingRepo, employeeRepo, sessionsGateway, useCase };
  }

  const sessionCommand = {
    employeeId: "emp-1",
    closingDate: "2026-06-07",
    tpa: 100, uber: 0, glovo: 0, bolt: 0, eatz: 0,
    cashSales: 62.37, cashIn: 100, cashOut: 0,
    cashDrawerOpen: 100, cashDrawerTotal: 200,
  };

  it("usa o total da sessão como vendusTotal", async () => {
    const { employeeRepo, useCase } = makeUseCaseWithSessions();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });

    const result = await useCase.execute({ ...sessionCommand, sessionOpenedAt: SESSION_1 });

    expect(result.vendusTotal).toBe(162.37);
    expect(result.sessionOpenedAt).toBe(SESSION_1);
  });

  it("permite dois fechos no mesmo dia se forem sessões distintas", async () => {
    const { closingRepo, employeeRepo, useCase } = makeUseCaseWithSessions();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });
    employeeRepo.addEmployee({ id: "emp-2", fullName: "Bruno Costa" });

    await useCase.execute({ ...sessionCommand, employeeId: "emp-1", sessionOpenedAt: SESSION_1 });
    await useCase.execute({ ...sessionCommand, employeeId: "emp-2", sessionOpenedAt: SESSION_2 });

    expect(closingRepo.findAll()).toHaveLength(2);
  });

  it("lança DuplicateClosingError se a sessão já foi fechada", async () => {
    const { employeeRepo, useCase } = makeUseCaseWithSessions();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });

    await useCase.execute({ ...sessionCommand, sessionOpenedAt: SESSION_1 });
    await expect(
      useCase.execute({ ...sessionCommand, sessionOpenedAt: SESSION_1 }),
    ).rejects.toThrow(DuplicateClosingError);
  });

  it("vendusTotal fica null se a API de sessões falhar (best-effort)", async () => {
    const { employeeRepo, sessionsGateway, useCase } = makeUseCaseWithSessions();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });
    sessionsGateway.shouldFail = true;

    const result = await useCase.execute({ ...sessionCommand, sessionOpenedAt: SESSION_1 });
    expect(result.vendusTotal).toBeNull();
    expect(result.status).toBe("pending");
  });
});

describe("SubmitClosingUseCase — totais AirMenu", () => {
  const baseCmd = {
    employeeId: "emp-1",
    closingDate: "2026-08-01",
    tpa: 200,
    uber: 50,
    glovo: 30,
    bolt: 20,
    eatz: 10,
    cashSales: 100,
    cashIn: 50,
    cashOut: 20,
    cashDrawerOpen: 100,
    cashDrawerTotal: 150,
  };

  it("popula airMenuUber/Glovo/Bolt a partir do gateway", async () => {
    const { employeeRepo, airMenuGateway, useCase } = makeUseCaseWithAirMenu();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });
    airMenuGateway.setTotals("2026-08-01", { uber: 48.20, glovo: 30.00, bolt: 21.50 });

    const result = await useCase.execute(baseCmd);

    expect(result.airMenuUber).toBe(48.20);
    expect(result.airMenuGlovo).toBe(30.00);
    expect(result.airMenuBolt).toBe(21.50);
    expect(result.airMenuTotal).toBe(99.70); // 48.20 + 30.00 + 21.50
  });

  it("airMenuUber/Glovo/Bolt ficam null se o gateway falhar (best-effort)", async () => {
    const { employeeRepo, airMenuGateway, useCase } = makeUseCaseWithAirMenu();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });
    airMenuGateway.shouldFail = true;

    const result = await useCase.execute(baseCmd);

    expect(result.airMenuUber).toBeNull();
    expect(result.airMenuGlovo).toBeNull();
    expect(result.airMenuBolt).toBeNull();
    expect(result.airMenuTotal).toBeNull();
    expect(result.status).toBe("pending");
  });

  it("totais AirMenu não afectam totalCalculated", async () => {
    const { employeeRepo, airMenuGateway, useCase } = makeUseCaseWithAirMenu();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });
    airMenuGateway.setTotals("2026-08-01", { uber: 9999, glovo: 9999, bolt: 9999 });

    const result = await useCase.execute(baseCmd);

    // totalCalculated = tpa + uber + glovo + bolt + eatz + cashSales = 410
    expect(result.totalCalculated).toBe(410);
  });
});
