import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { FoodCost, ProductMapping } from "../../domain/entities/food-cost.js";
import { InvalidProductMappingError, InvalidStatementPeriodError } from "../../domain/errors.js";
import type { GetFoodCostPort, ProductMappingChange, SaveProductMappingsPort } from "../../domain/ports/in/food-cost.port.js";
import type { PlatformStatementRepositoryPort } from "../../domain/ports/out/platform-statement-repository.port.js";
import type { ProductCostsReadPort } from "../../domain/ports/out/product-costs.port.js";
import type { ProductMappingRepositoryPort } from "../../domain/ports/out/product-mapping-repository.port.js";
import { computeFoodCost, productKey } from "../../domain/services/food-cost.service.js";

const pad = (n: number) => String(n).padStart(2, "0");

export class GetFoodCostUseCase implements GetFoodCostPort {
  constructor(
    private readonly statements: PlatformStatementRepositoryPort,
    private readonly mappings: ProductMappingRepositoryPort,
    private readonly costs: ProductCostsReadPort,
  ) {}

  async execute({ organizationId, year, month }: { organizationId: OrganizationId; year: number; month: number }): Promise<FoodCost> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new InvalidStatementPeriodError();
    }
    const from = `${year}-${pad(month)}-01`;
    const to = `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
    const [statements, mappings, dishes, items] = await Promise.all([
      this.statements.listOverlapping(organizationId, from, to, "airmenu"),
      this.mappings.list(organizationId),
      this.costs.dishCosts(organizationId),
      this.costs.itemCosts(organizationId),
    ]);
    return computeFoodCost(year, month, statements, mappings, dishes, items);
  }
}

const SIZES = new Set(["xs", "small", "large"]);

export class SaveProductMappingsUseCase implements SaveProductMappingsPort {
  constructor(private readonly mappings: ProductMappingRepositoryPort) {}

  async execute({ organizationId, changes, updatedBy }: { organizationId: OrganizationId; changes: ProductMappingChange[]; updatedBy: string | null }): Promise<void> {
    const toSave: ProductMapping[] = [];
    const toRemove: string[] = [];
    for (const c of changes) {
      // As chaves reservadas da embalagem («@…») ficam como vêm; as dos produtos normalizam-se.
      const key = c.productKey.startsWith("@") ? c.productKey : productKey(c.productKey);
      if (!key) throw new InvalidProductMappingError("produto sem nome");
      if (c.targetType === null) {
        toRemove.push(key);
        continue;
      }
      if (c.targetType === "dish" && (!c.pizzaId || !c.size || !SIZES.has(c.size))) {
        throw new InvalidProductMappingError(`${c.productDescription}: escolha o prato e o tamanho`);
      }
      if (c.targetType === "item" && !c.stockItemId) throw new InvalidProductMappingError(`${c.productDescription}: escolha o artigo`);
      if (key.startsWith("@") && c.targetType !== "item") throw new InvalidProductMappingError("a embalagem tem de ser um artigo de stock");
      toSave.push({
        productKey: key,
        productCode: c.productCode,
        productDescription: c.productDescription,
        targetType: c.targetType,
        pizzaId: c.targetType === "dish" ? c.pizzaId! : null,
        size: c.targetType === "dish" ? c.size! : null,
        stockItemId: c.targetType === "item" ? c.stockItemId! : null,
      });
    }
    if (toSave.length > 0) await this.mappings.save(organizationId, toSave, updatedBy);
    if (toRemove.length > 0) await this.mappings.remove(organizationId, toRemove);
  }
}
