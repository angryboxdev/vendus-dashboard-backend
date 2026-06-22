import { ListSuppliersUseCase } from "../../application/use-cases/list-suppliers.use-case.js";
import { FakeSupplierRepository } from "../fakes/fake-supplier-repository.js";
import { Supplier } from "../../domain/entities/supplier.js";

async function makeRepo() {
  const repo = new FakeSupplierRepository();
  await repo.save(Supplier.create({ name: "Makro Portugal", nif: "500123456" }));
  await repo.save(Supplier.create({ name: "Meta Platforms", nif: "999888777" }));
  const inactive = Supplier.create({ name: "Fornecedor Inativo" }).deactivate();
  await repo.save(inactive);
  return repo;
}

describe("ListSuppliersUseCase", () => {
  it("devolve todos os fornecedores sem filtro", async () => {
    const repo = await makeRepo();
    const useCase = new ListSuppliersUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveLength(3);
  });

  it("filtra apenas fornecedores ativos", async () => {
    const repo = await makeRepo();
    const useCase = new ListSuppliersUseCase(repo);

    const result = await useCase.execute({ status: "active" });

    expect(result).toHaveLength(2);
    expect(result.every((s) => s.status === "active")).toBe(true);
  });

  it("filtra apenas fornecedores inativos", async () => {
    const repo = await makeRepo();
    const useCase = new ListSuppliersUseCase(repo);

    const result = await useCase.execute({ status: "inactive" });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Fornecedor Inativo");
  });

  it("pesquisa por nome (case-insensitive)", async () => {
    const repo = await makeRepo();
    const useCase = new ListSuppliersUseCase(repo);

    const result = await useCase.execute({ search: "makro" });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Makro Portugal");
  });

  it("pesquisa por NIF", async () => {
    const repo = await makeRepo();
    const useCase = new ListSuppliersUseCase(repo);

    const result = await useCase.execute({ search: "999888777" });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Meta Platforms");
  });

  it("combina filtro status e search", async () => {
    const repo = await makeRepo();
    const useCase = new ListSuppliersUseCase(repo);

    const result = await useCase.execute({ status: "active", search: "meta" });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Meta Platforms");
  });

  it("devolve lista vazia quando não há correspondência", async () => {
    const repo = await makeRepo();
    const useCase = new ListSuppliersUseCase(repo);

    const result = await useCase.execute({ search: "xpto-inexistente" });

    expect(result).toEqual([]);
  });
});
