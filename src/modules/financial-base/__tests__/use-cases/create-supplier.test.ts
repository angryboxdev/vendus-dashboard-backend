import { CreateSupplierUseCase } from "../../application/use-cases/create-supplier.use-case.js";
import { FakeSupplierRepository } from "../fakes/fake-supplier-repository.js";

describe("CreateSupplierUseCase", () => {
  let repo: FakeSupplierRepository;
  let useCase: CreateSupplierUseCase;

  beforeEach(() => {
    repo = new FakeSupplierRepository();
    useCase = new CreateSupplierUseCase(repo);
  });

  it("cria um fornecedor e persiste-o", async () => {
    const result = await useCase.execute({ name: "Aldeia Portugal" });

    expect(result.id).toBeDefined();
    expect(result.name).toBe("Aldeia Portugal");
    expect(result.status).toBe("active");

    const saved = await repo.findById(result.id);
    expect(saved).not.toBeNull();
  });

  it("cria um fornecedor com campos opcionais", async () => {
    const result = await useCase.execute({
      name: "Makro",
      nif: "500123456",
      email: "encomendas@makro.pt",
      paymentTermsDays: 30,
    });

    expect(result.nif).toBe("500123456");
    expect(result.email).toBe("encomendas@makro.pt");
    expect(result.paymentTermsDays).toBe(30);
    expect(result.iban).toBeNull();
  });
});
