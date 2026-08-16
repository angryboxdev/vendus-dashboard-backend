import type { CategorySnapshot } from "../../entities/invoice-line.js";

export interface CategoryLookup {
  id: string;
  code: string;
  name: string;
  financialType: string | null;
}

export interface CostCenterCategoryReaderPort {
  findById(id: string): Promise<CategorySnapshot | null>;
  findManyByIds(ids: string[]): Promise<CategoryLookup[]>;
}
