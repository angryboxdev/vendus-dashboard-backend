import type { CategorySnapshot } from "../../entities/invoice-line.js";

export interface CostCenterCategoryReaderPort {
  findById(id: string): Promise<CategorySnapshot | null>;
}
