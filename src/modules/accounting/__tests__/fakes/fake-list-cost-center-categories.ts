import type {
  CostCenterCategoryDTO,
  ListCostCenterCategoriesCommand,
  ListCostCenterCategoriesPort,
} from "../../../financial-base/domain/ports/in/cost-center-category.ports.js";

export function categoryStub(overrides: Partial<CostCenterCategoryDTO>): CostCenterCategoryDTO {
  return {
    id: "cat-1",
    groupId: "group-1",
    code: "OPD.01",
    name: "CMV / Ingredientes",
    financialType: "cmv",
    affectsDre: true,
    affectsCashflow: true,
    affectsProfitability: true,
    requiresChannel: false,
    requiresAllocation: false,
    vatDeductible: true,
    isActive: true,
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export class FakeListCostCenterCategories implements ListCostCenterCategoriesPort {
  rows: CostCenterCategoryDTO[] = [];

  async execute(_command: ListCostCenterCategoriesCommand): Promise<CostCenterCategoryDTO[]> {
    return this.rows;
  }
}
