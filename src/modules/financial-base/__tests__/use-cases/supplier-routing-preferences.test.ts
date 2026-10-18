import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateSupplierUseCase } from "../../application/use-cases/create-supplier.use-case.js";
import { SupplierLocationRulesUseCases } from "../../application/use-cases/supplier-location-rules.use-cases.js";
import { UpdateSupplierUseCase } from "../../application/use-cases/update-supplier.use-case.js";
import { CostCenterCategory } from "../../domain/entities/cost-center-category.js";
import { InvalidFinancialModeError, InvalidSupplierDefaultsError } from "../../domain/errors.js";
import { FakeCostCenterCategoryRepository } from "../fakes/fake-cost-center-category-repository.js";
import { FakeLocationRead } from "../fakes/fake-location-read.js";
import { FakeSupplierLocationRuleRepository } from "../fakes/fake-supplier-location-rule-repository.js";
import { FakeSupplierRepository } from "../fakes/fake-supplier-repository.js";

const ORG = mintOrganizationId("org-test");
const category = (groupId: string, name: string) =>
  CostCenterCategory.create({ groupId, code: name.slice(0, 3).toUpperCase(), name, financialType: "cmv", affectsDre: true, affectsCashflow: true, affectsProfitability: true });

async function setup() {
  const suppliers = new FakeSupplierRepository();
  const categories = new FakeCostCenterCategoryRepository();
  const locations = new FakeLocationRead().seed({ id: "loc-mbs", name: "MBS" }, { id: "loc-old", name: "Antiga", isActive: false });
  const ingredientes = category("grp-cmv", "Ingredientes");
  const energia = category("grp-opex", "Energia");
  await categories.save(ORG, ingredientes);
  await categories.save(ORG, energia);
  const create = new CreateSupplierUseCase(suppliers, categories, locations);
  const update = new UpdateSupplierUseCase(suppliers, categories, locations);
  const rules = new SupplierLocationRulesUseCases(suppliers, new FakeSupplierLocationRuleRepository(), categories, locations);
  return { create, update, rules, ingredientes, energia };
}

describe("Ficha do fornecedor — predefinições e encaminhamento (F2 §2.1)", () => {
  test("guarda modo financeiro, destino habitual, tipo financeiro e «Decidir no documento»", async () => {
    const s = await setup();
    const sup = await s.create.execute({
      organizationId: ORG, name: "Makro", defaultCostCenterGroupId: "grp-cmv", defaultCostCenterCategoryId: s.ingredientes.id,
      defaultFinancialMode: "by_values", defaultLocationId: "loc-mbs", defaultFinancialType: "cmv", defaultStockPolicy: "decide_per_document",
    });
    expect(sup).toMatchObject({ defaultFinancialMode: "by_values", defaultLocationId: "loc-mbs", defaultFinancialType: "cmv", defaultStockPolicy: "decide_per_document" });
  });

  test("valida o par grupo/subcategoria e a loja (existente e ativa)", async () => {
    const s = await setup();
    await expect(s.create.execute({ organizationId: ORG, name: "X", defaultCostCenterGroupId: "grp-cmv", defaultCostCenterCategoryId: s.energia.id })).rejects.toBeInstanceOf(InvalidSupplierDefaultsError);
    await expect(s.create.execute({ organizationId: ORG, name: "X", defaultLocationId: "loc-old" })).rejects.toThrow(/inativa/);
    await expect(s.create.execute({ organizationId: ORG, name: "X", defaultLocationId: "loc-outra-org" })).rejects.toThrow(/não existe/);
    await expect(s.create.execute({ organizationId: ORG, name: "X", defaultFinancialMode: "mixed" as never })).rejects.toBeInstanceOf(InvalidFinancialModeError);
  });

  test("editar: muda o modo sem tocar no resto; limpar o destino é permitido", async () => {
    const s = await setup();
    const sup = await s.create.execute({ organizationId: ORG, name: "EDP", defaultLocationId: "loc-mbs" });
    const r = await s.update.execute({ organizationId: ORG, id: sup.id, data: { defaultFinancialMode: "single", defaultLocationId: null } });
    expect(r).toMatchObject({ defaultFinancialMode: "single", defaultLocationId: null, name: "EDP" });
  });

  test("exceção por loja: uma por fornecedor/loja, substitui ao gravar de novo, valida e remove", async () => {
    const s = await setup();
    const sup = await s.create.execute({ organizationId: ORG, name: "Makro", defaultStockPolicy: "usually_creates_review" });
    await s.rules.upsert({ organizationId: ORG, supplierId: sup.id, locationId: "loc-mbs", stockPolicy: "usually_skips_review", actor: "gestor" });
    await s.rules.upsert({ organizationId: ORG, supplierId: sup.id, locationId: "loc-mbs", stockPolicy: "decide_per_document", actor: "gestor" });
    const list = await s.rules.list(ORG, sup.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ locationId: "loc-mbs", stockPolicy: "decide_per_document" });
    await expect(s.rules.upsert({ organizationId: ORG, supplierId: sup.id, locationId: "loc-mbs", actor: "gestor" })).rejects.toBeInstanceOf(InvalidSupplierDefaultsError);
    await expect(s.rules.upsert({ organizationId: ORG, supplierId: sup.id, locationId: "loc-old", stockPolicy: "usually_skips_review", actor: "gestor" })).rejects.toThrow(/inativa/);
    await s.rules.remove(ORG, sup.id, "loc-mbs");
    expect(await s.rules.list(ORG, sup.id)).toEqual([]);
  });
});
