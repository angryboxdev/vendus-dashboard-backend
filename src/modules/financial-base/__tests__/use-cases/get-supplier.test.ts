import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetSupplierUseCase } from "../../application/use-cases/get-supplier.use-case.js";
import { FakeSupplierRepository } from "../fakes/fake-supplier-repository.js";
import { Supplier } from "../../domain/entities/supplier.js";
import { SupplierNotFoundError } from "../../domain/errors.js";

const ORG_ID = mintOrganizationId("org-test");

describe("GetSupplierUseCase", () => {
  it("devolve o fornecedor pelo id", async () => {
    const repo = new FakeSupplierRepository();
    const supplier = Supplier.create({ name: "Makro Portugal" });
    await repo.save(ORG_ID, supplier);

    const useCase = new GetSupplierUseCase(repo);
    const result = await useCase.execute({ organizationId: ORG_ID, id: supplier.id });

    expect(result.id).toBe(supplier.id);
    expect(result.name).toBe("Makro Portugal");
  });

  it("lança SupplierNotFoundError se o id não existe", async () => {
    const repo = new FakeSupplierRepository();
    const useCase = new GetSupplierUseCase(repo);

    await expect(
      useCase.execute({ organizationId: ORG_ID, id: "nao-existe" }),
    ).rejects.toThrow(SupplierNotFoundError);
  });
});
