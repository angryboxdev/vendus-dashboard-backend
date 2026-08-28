import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { VerifyPinUseCase } from "../../application/use-cases/verify-pin.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { InvalidPinError } from "../../domain/errors.js";

const HASH_PREFIX = "hash:";
function fakeHashPin(pin: string): string {
  return HASH_PREFIX + pin;
}

const organizationId = mintOrganizationId("org-a");

describe("VerifyPinUseCase", () => {
  function makeUseCase() {
    const repo = new FakeEmployeeRepository();
    const useCase = new VerifyPinUseCase(repo, fakeHashPin);
    return { repo, useCase };
  }

  it("devolve employeeId e fullName para PIN válido", async () => {
    const { repo, useCase } = makeUseCase();
    repo.addEmployee(organizationId, { id: "emp-1", fullName: "Ana Silva" }, HASH_PREFIX + "1234");

    const result = await useCase.execute({ organizationId, pin: "1234" });

    expect(result.employeeId).toBe("emp-1");
    expect(result.fullName).toBe("Ana Silva");
  });

  it("lança InvalidPinError para PIN inválido", async () => {
    const { useCase } = makeUseCase();
    await expect(useCase.execute({ organizationId, pin: "0000" })).rejects.toThrow(InvalidPinError);
  });

  it("usa o hashPin injectado para derivar o hash antes de pesquisar", async () => {
    const { repo, useCase } = makeUseCase();
    repo.addEmployee(organizationId, { id: "emp-2", fullName: "Bruno Costa" }, HASH_PREFIX + "9999");

    // PIN correcto mas hash errado não deve encontrar
    await expect(useCase.execute({ organizationId, pin: "9998" })).rejects.toThrow(InvalidPinError);

    // PIN correcto encontra
    const result = await useCase.execute({ organizationId, pin: "9999" });
    expect(result.employeeId).toBe("emp-2");
  });

  it("não encontra um funcionário registado noutra organização", async () => {
    const { repo, useCase } = makeUseCase();
    const otherOrganizationId = mintOrganizationId("org-b");
    repo.addEmployee(otherOrganizationId, { id: "emp-1", fullName: "Ana Silva" }, HASH_PREFIX + "1234");

    await expect(useCase.execute({ organizationId, pin: "1234" })).rejects.toThrow(InvalidPinError);
  });
});
