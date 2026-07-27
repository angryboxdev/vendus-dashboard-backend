import { describe, it, expect, beforeEach } from "@jest/globals";
import { CreateBankUseCase } from "../../application/use-cases/create-bank.use-case.js";
import { FakeBankRepository } from "../fakes/fake-bank-repository.js";

describe("CreateBankUseCase", () => {
  let repo: FakeBankRepository;
  let useCase: CreateBankUseCase;

  beforeEach(() => {
    repo = new FakeBankRepository();
    useCase = new CreateBankUseCase(repo);
  });

  it("creates and persists a bank", async () => {
    const result = await useCase.execute({
      name: "Millennium BCP",
      logoKey: "millennium_bcp",
      color: "#1A5276",
      country: "PT",
      statementFormat: "millennium_bcp_csv",
    });
    expect(result.id).toBeDefined();
    expect(result.name).toBe("Millennium BCP");
    expect(result.bic).toBeNull();
    const stored = await repo.findById(result.id);
    expect(stored).not.toBeNull();
  });

  it("persists optional BIC", async () => {
    const result = await useCase.execute({
      name: "CGD",
      logoKey: "cgd",
      color: "#003F7F",
      country: "PT",
      statementFormat: "cgd_csv",
      bic: "CGDIPTPL",
    });
    expect(result.bic).toBe("CGDIPTPL");
  });

  it("rejects invalid hex color", async () => {
    await expect(
      useCase.execute({
        name: "Test",
        logoKey: "other",
        color: "red",
        country: "PT",
        statementFormat: "generic_csv",
      })
    ).rejects.toThrow("hex color");
  });
});
