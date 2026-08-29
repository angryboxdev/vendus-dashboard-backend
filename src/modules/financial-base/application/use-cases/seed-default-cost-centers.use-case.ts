import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { CostCenterGroup } from "../../domain/entities/cost-center-group.js";
import { CostCenterCategory } from "../../domain/entities/cost-center-category.js";
import { DEFAULT_COST_CENTERS } from "../../domain/seed/default-cost-centers.js";
import type { CostCenterGroupRepositoryPort } from "../../domain/ports/out/cost-center-group-repository.port.js";
import type { CostCenterCategoryRepositoryPort } from "../../domain/ports/out/cost-center-category-repository.port.js";
import type {
  SeedDefaultCostCentersPort,
  SeedResult,
} from "../../domain/ports/in/cost-center-category.ports.js";

export class SeedDefaultCostCentersUseCase implements SeedDefaultCostCentersPort {
  constructor(
    private readonly groupRepository: CostCenterGroupRepositoryPort,
    private readonly categoryRepository: CostCenterCategoryRepositoryPort,
  ) {}

  async execute(organizationId: OrganizationId): Promise<SeedResult> {
    let groupsCreated = 0;
    let groupsSkipped = 0;
    let categoriesCreated = 0;
    let categoriesSkipped = 0;

    for (const groupSeed of DEFAULT_COST_CENTERS) {
      let group = await this.groupRepository.findByCode(organizationId, groupSeed.code);

      if (!group) {
        group = CostCenterGroup.create({
          code: groupSeed.code,
          name: groupSeed.name,
          description: groupSeed.description,
          sortOrder: groupSeed.sortOrder,
        });
        await this.groupRepository.save(organizationId, group);
        groupsCreated++;
      } else {
        groupsSkipped++;
      }

      for (const catSeed of groupSeed.categories) {
        const existing = await this.categoryRepository.findByCode(organizationId, catSeed.code);
        if (existing) {
          categoriesSkipped++;
          continue;
        }

        const category = CostCenterCategory.create({
          groupId: group.id,
          code: catSeed.code,
          name: catSeed.name,
          financialType: catSeed.financialType,
          affectsDre: catSeed.affectsDre,
          affectsCashflow: catSeed.affectsCashflow,
          affectsProfitability: catSeed.affectsProfitability,
          requiresChannel: catSeed.requiresChannel,
          requiresAllocation: catSeed.requiresAllocation,
        });
        await this.categoryRepository.save(organizationId, category);
        categoriesCreated++;
      }
    }

    return { groupsCreated, groupsSkipped, categoriesCreated, categoriesSkipped };
  }
}
