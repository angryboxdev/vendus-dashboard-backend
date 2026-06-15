import { SubmitClosingUseCase } from "../../application/use-cases/submit-closing.use-case.js";
import { ReviewClosingUseCase } from "../../application/use-cases/review-closing.use-case.js";
import { FakeCashClosingRepository } from "../fakes/fake-cash-closing-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeVendusRegisterSessionsGateway } from "../fakes/fake-vendus-register-sessions-gateway.js";
import { ClosingNotFoundError } from "../../domain/errors.js";

function makeUseCases() {
  const closingRepo = new FakeCashClosingRepository();
  const employeeRepo = new FakeEmployeeRepository();
  const sessionsGateway = new FakeVendusRegisterSessionsGateway();
  const submitUseCase = new SubmitClosingUseCase(closingRepo, employeeRepo, sessionsGateway);
  const reviewUseCase = new ReviewClosingUseCase(closingRepo);
  return { closingRepo, employeeRepo, submitUseCase, reviewUseCase };
}

describe("ReviewClosingUseCase", () => {
  it("aprova um fecho e define reviewedAt", async () => {
    const { employeeRepo, submitUseCase, reviewUseCase } = makeUseCases();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });

    const submitted = await submitUseCase.execute({
      employeeId: "emp-1", closingDate: "2026-06-10",
      tpa: 200, uber: 50, glovo: 0, bolt: 0, eatz: 0, cashSales: 100,
      cashIn: 0, cashOut: 0, cashDrawerOpen: 100, cashDrawerTotal: 200,
    });

    const result = await reviewUseCase.execute({
      id: submitted.id,
      status: "approved",
      managerNotes: "confere tudo",
    });

    expect(result.status).toBe("approved");
    expect(result.managerNotes).toBe("confere tudo");
    expect(result.reviewedAt).not.toBeNull();
  });

  it("edita valores numéricos e recalcula totais", async () => {
    const { employeeRepo, submitUseCase, reviewUseCase } = makeUseCases();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });

    const submitted = await submitUseCase.execute({
      employeeId: "emp-1", closingDate: "2026-06-10",
      tpa: 200, uber: 50, glovo: 0, bolt: 0, eatz: 0, cashSales: 100,
      cashIn: 0, cashOut: 0, cashDrawerOpen: 100, cashDrawerTotal: 200,
    });

    const result = await reviewUseCase.execute({ id: submitted.id, tpa: 300 });

    // 300 + 50 + 0 + 0 + 0 + 100 = 450
    expect(result.totalCalculated).toBe(450);
    expect(result.tpa).toBe(300);
  });

  it("recalcula sangria ao editar cashDrawerTotal", async () => {
    const { employeeRepo, submitUseCase, reviewUseCase } = makeUseCases();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });

    const submitted = await submitUseCase.execute({
      employeeId: "emp-1", closingDate: "2026-06-10",
      tpa: 100, uber: 0, glovo: 0, bolt: 0, eatz: 0, cashSales: 0,
      cashIn: 0, cashOut: 0, cashDrawerOpen: 100, cashDrawerTotal: 80,
    });
    expect(submitted.sangriaAmount).toBe(0);

    const result = await reviewUseCase.execute({ id: submitted.id, cashDrawerTotal: 450 });
    expect(result.sangriaAmount).toBe(350);
  });

  it("lança ClosingNotFoundError para ID inválido", async () => {
    const { reviewUseCase } = makeUseCases();
    await expect(reviewUseCase.execute({ id: "non-existent", status: "approved" }))
      .rejects.toThrow(ClosingNotFoundError);
  });

  it("persiste as alterações no repositório", async () => {
    const { closingRepo, employeeRepo, submitUseCase, reviewUseCase } = makeUseCases();
    employeeRepo.addEmployee({ id: "emp-1", fullName: "Ana Silva" });

    const submitted = await submitUseCase.execute({
      employeeId: "emp-1", closingDate: "2026-06-10",
      tpa: 100, uber: 0, glovo: 0, bolt: 0, eatz: 0, cashSales: 0,
      cashIn: 0, cashOut: 0, cashDrawerOpen: 100, cashDrawerTotal: 100,
    });

    await reviewUseCase.execute({ id: submitted.id, status: "rejected", managerNotes: "erro" });

    const persisted = await closingRepo.findById(submitted.id);
    expect(persisted?.status).toBe("rejected");
    expect(persisted?.managerNotes).toBe("erro");
  });
});
