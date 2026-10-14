import type { DefaultStockPolicy } from "./supplier.js";

/**
 * Exceção por loja da ficha do fornecedor (F2 v1.2 §2.1): prevalece sobre a
 * regra geral do fornecedor para essa loja. Pelo menos um campo definido.
 */
export interface SupplierLocationRule {
  id: string;
  supplierId: string;
  locationId: string;
  stockPolicy: DefaultStockPolicy | null;
  costCenterGroupId: string | null;
  costCenterCategoryId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
