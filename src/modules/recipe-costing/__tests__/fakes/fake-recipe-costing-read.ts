import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { RecipeCostingSnapshot } from "../../domain/entities/recipe-costing.js";
import type { RecipeCostingReadPort } from "../../domain/ports/out/recipe-costing-read.port.js";

export class FakeRecipeCostingRead implements RecipeCostingReadPort {
  snapshot: RecipeCostingSnapshot = { dishes: [], preparations: [], ingredients: [] };
  calls: OrganizationId[] = [];

  async loadSnapshot(organizationId: OrganizationId): Promise<RecipeCostingSnapshot> {
    this.calls.push(organizationId);
    return this.snapshot;
  }
}
